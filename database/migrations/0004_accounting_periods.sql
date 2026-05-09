-- ============================================================
-- BOMATECH — Migration 0004 : périodes comptables (clôtures)
-- ============================================================
-- V1 SCOPE NOTICE
-- ----------------
-- Gestion des exercices comptables :
--   * Une company a 0..N périodes clôturées (table accounting_closures).
--   * Chaque transaction et invoice porte un flag is_closed_period qui
--     indique si elle appartient à une période close (lecture seule).
--   * Le flag est mis automatiquement par des triggers AUTORITAIRES
--     selon NEW.date <= companies.last_closing_date — la valeur que
--     l'app passerait est ignorée (source de vérité = la date).
--   * Les modifications/suppressions sur rows is_closed_period=true sont
--     interdites (RLS pour users + trigger pour service_role) sauf si
--     la session a SET app.allow_archive_modification = 'true'.
--   * Une RPC close_period() encapsule la clôture en une transaction
--     PG atomique. SECURITY DEFINER + check d'auth EN TOUTE PREMIÈRE
--     INSTRUCTION (non-négociable, sinon n'importe quel user authentifié
--     pourrait clôturer la company d'un autre).
--
-- V2 backlog :
--   * Réouverture d'une période clôturée
--   * Soft closing mensuelle
--   * Workflow validation externe expert-comptable
--   * Génération automatique FEC + liasse fiscale
-- ============================================================

-- 1. Champs sur companies -----------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN current_period_start date,
  ADD COLUMN last_closing_date date;

COMMENT ON COLUMN public.companies.current_period_start IS
  'Début de l''exercice en cours (ex 2026-01-01). Mis à last_closing_date + 1 day par close_period().';
COMMENT ON COLUMN public.companies.last_closing_date IS
  'Date de la dernière clôture validée (ex 2025-12-31). NULL si jamais clôturée.';

-- 2. Historique des clôtures --------------------------------------------------
CREATE TABLE public.accounting_closures (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  closed_at timestamptz default now(),
  closed_by uuid references public.profiles(id) on delete set null,
  notes text,
  unique (company_id, period_end)
);

CREATE INDEX idx_closures_company_end
  ON public.accounting_closures(company_id, period_end DESC);

ALTER TABLE public.accounting_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closures_company_select" ON public.accounting_closures
  FOR SELECT
  USING (company_id IN (SELECT public.user_company_ids()));

-- INSERT est fait via la RPC close_period() (SECURITY DEFINER), pas par les
-- users directement → pas de policy INSERT publique.

-- 3. Flag is_closed_period sur transactions + invoices_emitted ----------------
ALTER TABLE public.transactions
  ADD COLUMN is_closed_period boolean not null default false;

ALTER TABLE public.invoices_emitted
  ADD COLUMN is_closed_period boolean not null default false;

-- Index partiels : la majorité des queries filtre is_closed_period=false
CREATE INDEX idx_transactions_open_period
  ON public.transactions(company_id, date DESC)
  WHERE is_closed_period = false;

CREATE INDEX idx_invoices_emitted_open_period
  ON public.invoices_emitted(company_id, issued_at DESC)
  WHERE is_closed_period = false;

-- 4. Triggers auto-flag BEFORE INSERT (AUTORITAIRES) --------------------------
-- Source de vérité unique = NEW.date vs companies.last_closing_date.
-- La valeur is_closed_period que l'app passerait est ÉCRASÉE systématiquement.

CREATE OR REPLACE FUNCTION public.flag_closed_period_tx()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_closing date;
BEGIN
  SELECT last_closing_date INTO v_last_closing
  FROM public.companies
  WHERE id = NEW.company_id;

  NEW.is_closed_period := (v_last_closing IS NOT NULL AND NEW.date <= v_last_closing);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_closed_period_tx
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_closed_period_tx();

CREATE OR REPLACE FUNCTION public.flag_closed_period_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_closing date;
BEGIN
  SELECT last_closing_date INTO v_last_closing
  FROM public.companies
  WHERE id = NEW.company_id;

  NEW.is_closed_period := (v_last_closing IS NOT NULL AND NEW.issued_at <= v_last_closing);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_closed_period_invoice
  BEFORE INSERT ON public.invoices_emitted
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_closed_period_invoice();

-- 5. Trigger anti-modification sur rows archivées (BEFORE UPDATE/DELETE) ------
-- Bloque tout, y compris service_role qui bypasse les RLS policies.
-- Échappatoire : SET app.allow_archive_modification = 'true' dans la session
-- pour les procédures de rectification (V2 documenté).

CREATE OR REPLACE FUNCTION public.prevent_modify_archived()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_archive_modification', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_closed_period = true THEN
    RAISE EXCEPTION
      'Modification interdite : % en période close (id=%). SET app.allow_archive_modification = ''true'' pour rectifier.',
      TG_TABLE_NAME, OLD.id;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.is_closed_period = true THEN
    RAISE EXCEPTION
      'Suppression interdite : % en période close (id=%). SET app.allow_archive_modification = ''true'' pour rectifier.',
      TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_prevent_modify_archived_tx
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modify_archived();

CREATE TRIGGER trg_prevent_modify_archived_invoice
  BEFORE UPDATE OR DELETE ON public.invoices_emitted
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_modify_archived();

-- 6. RLS policies UPDATE/DELETE archived (defense-in-depth pour users normaux)
-- Les users non-service_role ne passent même pas par le trigger : leur requête
-- est filtrée par RLS avant.

CREATE POLICY "transactions_block_update_archived" ON public.transactions
  FOR UPDATE
  USING (is_closed_period = false);

CREATE POLICY "transactions_block_delete_archived" ON public.transactions
  FOR DELETE
  USING (is_closed_period = false);

CREATE POLICY "invoices_block_update_archived" ON public.invoices_emitted
  FOR UPDATE
  USING (is_closed_period = false);

CREATE POLICY "invoices_block_delete_archived" ON public.invoices_emitted
  FOR DELETE
  USING (is_closed_period = false);

-- 7. RPC close_period — atomique, autorisée aux owner/admin uniquement -------
CREATE OR REPLACE FUNCTION public.close_period(
  p_company_id uuid,
  p_period_end date,
  p_notes text DEFAULT NULL
) RETURNS public.accounting_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_closure public.accounting_closures;
BEGIN
  -- ============================================================
  -- AUTH CHECK — TOUTE PREMIÈRE INSTRUCTION (NON-NÉGOCIABLE).
  -- Sans ça, SECURITY DEFINER permettrait à n'importe quel user
  -- authentifié de clôturer la période d'une company arbitraire.
  -- ============================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden: only owner or admin can close a period';
  END IF;

  -- Récupère la période courante (ou epoch comme défaut si jamais clôturé)
  SELECT coalesce(current_period_start, '1900-01-01'::date)
  INTO v_period_start
  FROM public.companies
  WHERE id = p_company_id;

  IF v_period_start > p_period_end THEN
    RAISE EXCEPTION 'period_end (%) must be >= current_period_start (%)',
      p_period_end, v_period_start;
  END IF;

  -- Insert l'historique de clôture (unique violation si déjà clôturée à cette date)
  INSERT INTO public.accounting_closures
    (company_id, period_start, period_end, closed_by, notes)
  VALUES
    (p_company_id, v_period_start, p_period_end, auth.uid(), p_notes)
  RETURNING * INTO v_closure;

  -- Flag les transactions de la période
  UPDATE public.transactions
  SET is_closed_period = true
  WHERE company_id = p_company_id
    AND date <= p_period_end
    AND is_closed_period = false;

  -- Flag les invoices de la période
  UPDATE public.invoices_emitted
  SET is_closed_period = true
  WHERE company_id = p_company_id
    AND issued_at <= p_period_end
    AND is_closed_period = false;

  -- Avance la période courante de la company
  UPDATE public.companies
  SET last_closing_date = p_period_end,
      current_period_start = p_period_end + INTERVAL '1 day'
  WHERE id = p_company_id;

  RETURN v_closure;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_period TO authenticated;

COMMENT ON FUNCTION public.close_period IS
  'Clôture atomique d''une période comptable (V1 : action irréversible). SECURITY DEFINER + check role owner/admin en première instruction. Voir migration 0004.';
