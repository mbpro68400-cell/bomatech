-- ============================================================
-- BOMATECH — Migration 0006 : relances de factures impayées (1.6.5)
-- ============================================================
-- V1 SCOPE NOTICE
-- ----------------
-- Cette migration ajoute :
--   (a) `client_email` (nullable) sur invoices_emitted, avec check regex format
--       basique. Pas de table `clients` dédiée en V1 — V2 (paiements partiels,
--       multi-factures par client). Pré-remplissage UX du dernier email connu
--       pour (company_id, client_name) géré côté query, pas côté DB.
--
--   (b) `invoice_reminders` : table d'audit + scheduler des relances par palier.
--       Snapshot du subject/body au moment de l'envoi (les templates en dur
--       vivent dans lib/email/templates.ts ; un changement de template
--       n'altère pas l'historique).
--
-- Paliers V1 : 1 = amiable (J+15), 2 = mise en demeure (J+30 + articles
--              L.441-10 et D.441-5 du Code de commerce).
--
-- Limites V1 (documentées dans le ROADMAP) :
--   * pas de webhook bounces/delivered (Hostinger ne le fournit pas)
--   * templates en dur (non éditables par user)
--   * pas de pause par client (uniquement par facture, V1.5)
--   * rate limit Hostinger 100/h, 1000/jour : pas de protection applicative V1
--   * cron quotidien fixe 09:00 Paris (V2 paramétrable par company)
-- ============================================================

-- ----------------------------------------------------------------
-- (a) client_email sur invoices_emitted
-- ----------------------------------------------------------------
ALTER TABLE public.invoices_emitted
  ADD COLUMN client_email text NULL;

ALTER TABLE public.invoices_emitted
  ADD CONSTRAINT invoices_emitted_client_email_format
  CHECK (client_email IS NULL OR client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

CREATE INDEX idx_invoices_company_email
  ON public.invoices_emitted(company_id, client_email)
  WHERE client_email IS NOT NULL;

-- ----------------------------------------------------------------
-- (b) invoice_reminders : audit + scheduler
-- ----------------------------------------------------------------
CREATE TABLE public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid NOT NULL REFERENCES public.invoices_emitted(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Palier : 1 = amiable J+15, 2 = mise en demeure J+30
  level smallint NOT NULL CHECK (level IN (1, 2)),

  -- Cycle de vie
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz NULL,
  failed_at timestamptz NULL,
  error_message text NULL,

  -- Snapshot du mail effectivement envoyé (le template peut évoluer)
  email_to text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,

  -- Origine : auto par le cron, manual par l'utilisateur
  created_by text NOT NULL DEFAULT 'auto'
    CHECK (created_by IN ('auto', 'manual')),
  created_by_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotence : pas deux fois le même palier sur la même facture.
CREATE UNIQUE INDEX idx_reminders_invoice_level
  ON public.invoice_reminders(invoice_id, level);

-- Hot path du cron : trouver les relances à envoyer maintenant.
CREATE INDEX idx_reminders_cron
  ON public.invoice_reminders(status, scheduled_at)
  WHERE status = 'scheduled';

-- Lookup par facture (timeline UI, count de relances dans la liste).
CREATE INDEX idx_reminders_invoice
  ON public.invoice_reminders(invoice_id);

-- ----------------------------------------------------------------
-- RLS : company-scoped, granularité par rôle (owner / admin / member)
-- ----------------------------------------------------------------
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_select ON public.invoice_reminders
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY reminders_insert ON public.invoice_reminders
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'accountant')
  ));

CREATE POLICY reminders_update ON public.invoice_reminders
  FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY reminders_delete ON public.invoice_reminders
  FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role = 'owner'
  ));
