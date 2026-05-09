-- ============================================================
-- BOMATECH — Migration 0005 : close_period v2 (1ère clôture explicite)
-- ============================================================
-- BUG FIX 1.7.1 — Bug 2 (de la session bug-hunt 1.7.1) :
-- period_start = 1900-01-01 aberrant.
-- ----------------
-- Avant (migration 0004) : close_period faisait un coalesce aberrant
-- à '1900-01-01' quand companies.current_period_start était NULL
-- (cas 1ère clôture). Cela polluait l'historique avec une période
-- 1900-01-01 → period_end sans aucun sens comptable.
--
-- Après (migration 0005) :
--   * Nouvel argument p_period_start date DEFAULT NULL.
--   * Résolution priorisée :
--       1. p_period_start argument si fourni → utilisé
--       2. sinon current_period_start de la company → utilisé
--       3. sinon RAISE EXCEPTION (1ère clôture sans p_period_start fourni)
--   * Plus de fallback aberrant.
--   * Validation supplémentaire : period_start ne peut pas chevaucher
--     une clôture précédente (period_start doit être strictement après
--     le dernier period_end de la company).
--
-- Inchangé : SECURITY DEFINER + check role owner/admin EN PREMIÈRE
-- INSTRUCTION (non-négociable), atomicité PL/pgSQL implicite.
--
-- Compatibilité : la signature gagne un 4e argument positional, mais
-- l'app TS appelle la RPC en mode NOMMÉ via supabase.rpc(), donc les
-- appels existants restent compatibles tant que p_period_start n'est
-- pas requis (default NULL → fallback sur current_period_start, le
-- comportement nominal des clôtures suivantes).
-- ============================================================

-- DROP avec la signature v1 (3 args : uuid, date, text)
DROP FUNCTION IF EXISTS public.close_period(uuid, date, text);

CREATE OR REPLACE FUNCTION public.close_period(
  p_company_id uuid,
  p_period_end date,
  p_notes text DEFAULT NULL,
  p_period_start date DEFAULT NULL
) RETURNS public.accounting_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_current_period_start date;
  v_max_existing_period_end date;
  v_closure public.accounting_closures;
BEGIN
  -- ============================================================
  -- AUTH CHECK — TOUTE PREMIÈRE INSTRUCTION (NON-NÉGOCIABLE).
  -- ============================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden: only owner or admin can close a period';
  END IF;

  -- ============================================================
  -- Résolution de period_start (3 niveaux de priorité) :
  --   1. p_period_start argument explicite
  --   2. companies.current_period_start si non NULL
  --   3. RAISE EXCEPTION (1ère clôture sans argument)
  -- ============================================================
  SELECT current_period_start
  INTO v_current_period_start
  FROM public.companies
  WHERE id = p_company_id;

  IF p_period_start IS NOT NULL THEN
    v_period_start := p_period_start;
  ELSIF v_current_period_start IS NOT NULL THEN
    v_period_start := v_current_period_start;
  ELSE
    RAISE EXCEPTION
      'period_start required for first closure (company.current_period_start is NULL and p_period_start argument was not provided)';
  END IF;

  -- ============================================================
  -- Validations métier
  -- ============================================================
  IF v_period_start > p_period_end THEN
    RAISE EXCEPTION 'period_end (%) must be >= period_start (%)',
      p_period_end, v_period_start;
  END IF;

  -- Pas de chevauchement avec les closures précédentes
  SELECT MAX(period_end)
  INTO v_max_existing_period_end
  FROM public.accounting_closures
  WHERE company_id = p_company_id;

  IF v_max_existing_period_end IS NOT NULL
     AND v_period_start <= v_max_existing_period_end THEN
    RAISE EXCEPTION
      'period_start (%) overlaps an existing closure (last period_end was %)',
      v_period_start, v_max_existing_period_end;
  END IF;

  -- ============================================================
  -- Action transactionnelle (atomicité implicite PL/pgSQL)
  -- ============================================================
  -- Insert closure (unique violation si même period_end déjà clôturé)
  INSERT INTO public.accounting_closures
    (company_id, period_start, period_end, closed_by, notes)
  VALUES
    (p_company_id, v_period_start, p_period_end, auth.uid(), p_notes)
  RETURNING * INTO v_closure;

  -- Flag les transactions de la période close
  UPDATE public.transactions
  SET is_closed_period = true
  WHERE company_id = p_company_id
    AND date <= p_period_end
    AND is_closed_period = false;

  -- Flag les invoices de la période close
  UPDATE public.invoices_emitted
  SET is_closed_period = true
  WHERE company_id = p_company_id
    AND issued_at <= p_period_end
    AND is_closed_period = false;

  -- Avance la période courante
  UPDATE public.companies
  SET last_closing_date = p_period_end,
      current_period_start = p_period_end + INTERVAL '1 day'
  WHERE id = p_company_id;

  RETURN v_closure;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_period(uuid, date, text, date) TO authenticated;

COMMENT ON FUNCTION public.close_period(uuid, date, text, date) IS
  'V2 (migration 0005) : période_start résolue dans l''ordre p_period_start argument → company.current_period_start → RAISE. Plus de fallback aberrant à 1900-01-01. Auth check role owner/admin en première instruction. Voir migration 0005 et ROADMAP 1.7.1.';
