-- ============================================================
-- BOMATECH — Migration 0003 : audit trail du rapprochement facture
-- ============================================================
-- V1 SCOPE NOTICE
-- ----------------
-- V1 reste 1-to-1 only (1 facture ↔ 1 transaction max). Voir migration 0002.
-- Les paiements partiels (table invoice_payments) sont prévus en V2.
--
-- Cette migration ajoute le suivi audit du rapprochement automatique ou
-- manuel d'une facture à une transaction bancaire.
--
-- Sémantique des audit fields (set par lib/queries/invoices.ts) :
--   matched_at        timestamptz  → date/heure du dernier rapprochement effectif
--   matched_by        text         → 'auto' (par l'engine) ou 'manual' (validation utilisateur)
--   matched_user_id   uuid         → user qui a confirmé un match (NULL pour 'auto')
--
-- Sémantique des trois branches (engine + applyAutoMatch) :
--   * score ≥ 0.90 + |delta| ≤ 1 % → status='paid', paid_at=tx.date,
--                                    matched_transaction_id, matched_at=now(),
--                                    matched_by='auto', matched_user_id=NULL,
--                                    match_confidence=score
--   * 0.60 ≤ score < 0.90 + |delta| ≤ 1 % → status reste 'pending' (suggestion),
--                                    matched_transaction_id, matched_at=now(),
--                                    matched_by='auto', match_confidence=score,
--                                    paid_at reste NULL
--   * score < 0.60 ou |delta| > 1 % → AUCUNE écriture en DB (anomalies in-memory only)
-- ============================================================

ALTER TABLE public.invoices_emitted
  ADD COLUMN matched_at timestamptz,
  ADD COLUMN matched_by text CHECK (matched_by IS NULL OR matched_by IN ('auto', 'manual')),
  ADD COLUMN matched_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_emitted_matched_at
  ON public.invoices_emitted(company_id, matched_at)
  WHERE matched_at IS NOT NULL;
