-- ============================================================
-- BOMATECH — Migration 0007 : veille fournisseurs (1.9)
-- ============================================================
-- V1 SCOPE NOTICE
-- ----------------
-- Cette migration ajoute le socle DB du module « Veille fournisseurs » :
--
--   (a) `suppliers` : fournisseurs surveillés par une company. Saisie 100 %
--       manuelle en V1 (SIRET ou nom → résolution SIREN via Pappers).
--       Pas d'extraction depuis libellés bancaires (V2). Identifiant
--       fonctionnel = SIREN (9 chiffres), unique par company.
--
--   (b) `supplier_alerts` : événements détectés par le diff Pappers
--       (engine `lib/engines/supplier-diff.ts`). Snapshot du payload au
--       moment du INSERT. Le mapping severity ↔ event_type est enforced
--       CÔTÉ TS (l'engine produit toujours des tuples cohérents),
--       PAS en DB — cf. note ci-dessous.
--
--   (c) `pappers_api_usage` : compteur global mensuel des appels Pappers
--       (clé API Bomatech partagée par tous les users en V1). Permet le
--       garde-fou quota du cron (warning à 800/1000, skip nouveaux
--       fournisseurs à 950/1000). Pas de RLS user-side : compteur opéré
--       par service_role uniquement.
--
-- TAXONOMIE DES EVENTS (V1) — 4 critical + 6 info = 10 entries
-- ------------------------------------------------------------
--   critical (déclenchent l'email digest quotidien) :
--     - procedure_collective_opened   : ouverture sauvegarde / RJ / LJ / conciliation
--                                        (sous-type dans payload.kind)
--     - procedure_collective_judgment : plan de continuation, conversion en LJ,
--                                        clôture pour insuffisance d'actif, etc.
--                                        (sous-type dans payload.kind)
--     - cessation                     : cessation d'activité déclarée
--     - radiation                     : radiation du RCS
--
--   info (banner + badge sidebar uniquement, pas d'email) :
--     - dirigeant_change   : changement de dirigeant principal
--     - comptes_published  : publication des comptes annuels (BODACC)
--     - address_change     : déménagement du siège
--     - naf_change         : changement de code NAF
--     - capital_change     : modification du capital social
--     - legal_form_change  : changement de forme juridique (SARL→SAS, etc.)
--
-- COHÉRENCE severity ↔ event_type
-- --------------------------------
-- Pas de contrainte DB enforce le mapping (CHECK trop verbeux et figé).
-- L'engine `lib/engines/supplier-diff.ts` est l'unique producteur des
-- alertes et garantit que chaque event_type sort avec la severity correcte.
-- Si un jour on accepte des INSERT manuels (V2 outils admin), refaire un
-- CHECK + tests d'intégration.
--
-- LIMITES V1 ASSUMÉES (documentées dans le ROADMAP) :
--   * SIRET LUHN check côté TS (P5b), pas DB — regex format suffit ici
--   * pas de scoring prédictif (V2)
--   * pas d'extraction auto depuis tx bancaires (V2)
--   * pas de webhooks BODACC temps réel (plan Pro, V1.5+)
--   * cron quotidien fixe 07:00 UTC, pas paramétrable par company
--   * pas de pause par fournisseur (V1.5)
-- ============================================================


-- ----------------------------------------------------------------
-- (a) suppliers — fournisseurs surveillés
-- ----------------------------------------------------------------
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Identité (dénormalisée depuis Pappers, refresh au polling)
  name text NOT NULL,
  siren varchar(9) NOT NULL,
  legal_form text NULL,                    -- "SARL", "SAS", "EURL", "EI", ...
  naf_code text NULL,                      -- "6201Z" par ex.
  registration_date date NULL,             -- date d'immatriculation RCS

  -- Statut greffe
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('active', 'cessation', 'radiation', 'unknown')),

  -- Dirigeants principaux (snapshot allégé, max ~5 entries en pratique)
  -- shape: [{ "nom": "...", "prenom": "...", "qualite": "...", "depuis": "YYYY-MM-DD" }]
  dirigeants jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Snapshot Pappers complet du dernier poll (sert au diff au prochain poll)
  last_pappers_snapshot jsonb NULL,
  last_polled_at timestamptz NULL,         -- NULL = jamais pollé (priorité FIFO)

  -- Notes utilisateur libres
  notes text NULL,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- SIREN = 9 chiffres exactement (LUHN validé côté TS avant INSERT)
  CONSTRAINT suppliers_siren_format CHECK (siren ~ '^[0-9]{9}$'),

  -- Un fournisseur n'est ajouté qu'une fois par company
  CONSTRAINT suppliers_company_siren_unique UNIQUE (company_id, siren)
);

CREATE TRIGGER trg_suppliers_updated
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Liste fournisseurs d'une company (page /suppliers)
CREATE INDEX idx_suppliers_company
  ON public.suppliers(company_id);

-- Hot path cron : FIFO sur last_polled_at ASC, NULLS FIRST = jamais pollés en tête
CREATE INDEX idx_suppliers_polling_queue
  ON public.suppliers(last_polled_at ASC NULLS FIRST);


-- ----------------------------------------------------------------
-- (b) supplier_alerts — événements détectés par le diff Pappers
-- ----------------------------------------------------------------
CREATE TABLE public.supplier_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  severity text NOT NULL
    CHECK (severity IN ('critical', 'info')),

  event_type text NOT NULL
    CHECK (event_type IN (
      'procedure_collective_opened',
      'procedure_collective_judgment',
      'cessation',
      'radiation',
      'dirigeant_change',
      'comptes_published',
      'address_change',
      'naf_change',
      'capital_change',
      'legal_form_change'
    )),

  -- Snapshot du delta : { before: {...}, after: {...}, kind?: "..." }
  -- (kind présent uniquement pour procedure_collective_* : sauvegarde|redressement|liquidation|conciliation|plan|conversion|cloture)
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Cycle d'email (digest quotidien, set par le cron après envoi réussi)
  email_sent_at timestamptz NULL,

  -- Acquittement utilisateur (sort du banner dashboard et du badge sidebar)
  dismissed_at timestamptz NULL,
  dismissed_by_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Listing chronologique d'une company (timeline UI + queries dashboard)
CREATE INDEX idx_supplier_alerts_company_created
  ON public.supplier_alerts(company_id, created_at DESC);

-- Timeline d'un fournisseur particulier (page /suppliers/[id])
CREATE INDEX idx_supplier_alerts_supplier_created
  ON public.supplier_alerts(supplier_id, created_at DESC);

-- Hot path digest cron : critical sans email envoyé
CREATE INDEX idx_supplier_alerts_pending_email
  ON public.supplier_alerts(company_id, created_at)
  WHERE severity = 'critical' AND email_sent_at IS NULL;

-- Hot path banner dashboard : critical non-acquittées
CREATE INDEX idx_supplier_alerts_undismissed_critical
  ON public.supplier_alerts(company_id)
  WHERE severity = 'critical' AND dismissed_at IS NULL;


-- ----------------------------------------------------------------
-- (c) pappers_api_usage — compteur global mensuel
-- ----------------------------------------------------------------
CREATE TABLE public.pappers_api_usage (
  month char(7) PRIMARY KEY,               -- 'YYYY-MM'
  calls_count integer NOT NULL DEFAULT 0
    CHECK (calls_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pappers_api_usage_month_format
    CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);


-- ============================================================
-- RLS — Row Level Security
-- ============================================================

-- ----------------------------------------------------------------
-- suppliers : company-scoped, granularité par rôle (pattern 0006)
-- ----------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
  ));

CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY suppliers_delete ON public.suppliers
  FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role = 'owner'
  ));


-- ----------------------------------------------------------------
-- supplier_alerts : SELECT/UPDATE/DELETE user-side, INSERT service-role only
-- ----------------------------------------------------------------
-- Les alertes sont générées par le cron via service_role (bypass RLS).
-- Aucun INSERT user-side en V1 → pas de policy INSERT (refus par défaut).
ALTER TABLE public.supplier_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_alerts_select ON public.supplier_alerts
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  ));

-- UPDATE = uniquement pour dismiss (set dismissed_at, dismissed_by_user_id)
CREATE POLICY supplier_alerts_update ON public.supplier_alerts
  FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY supplier_alerts_delete ON public.supplier_alerts
  FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role = 'owner'
  ));


-- ----------------------------------------------------------------
-- pappers_api_usage : RLS ON sans policy = accès service_role uniquement
-- ----------------------------------------------------------------
ALTER TABLE public.pappers_api_usage ENABLE ROW LEVEL SECURITY;
-- (aucune policy : tout user-side est refusé, le cron passe via service_role)
