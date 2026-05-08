-- ============================================================
-- BOMATECH — Migration 0002 : factures émises (sales invoices)
-- ============================================================
-- V1 SCOPE NOTICE
-- ----------------
-- Cette migration ne supporte volontairement QUE le paiement total :
-- une facture est rapprochée d'au plus UNE transaction bancaire
-- (matched_transaction_id en 1-to-1).
--
-- Les paiements échelonnés / partiels seront ajoutés en V2 via une
-- table `invoice_payments(invoice_id, transaction_id, amount_cents)`
-- qui complétera (et non remplacera) ce schéma. Voir ROADMAP backlog.
--
-- L'algorithme de rapprochement automatique (Phase 3 du roadmap factures)
-- ne flagge PAS une facture comme payée si le montant ne tombe pas dans
-- la tolérance frais bancaires (±1 %). Trois branches explicites :
--   * |montant - tx| / montant <= 0.01 ET score >= 0.90 → match auto
--   * tx < 0.99 * montant                              → suspicion paiement partiel (V1: à vérifier manuellement)
--   * tx > 1.01 * montant                              → trop-perçu (à vérifier)
-- ============================================================

create table public.invoices_emitted (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Identité
  number text not null,                        -- "FAC-2026-001"
  client_name text not null,

  -- Montants en cents (jamais de float pour de la monnaie)
  amount_ht_cents bigint not null check (amount_ht_cents >= 0),
  amount_tva_cents bigint not null check (amount_tva_cents >= 0),
  amount_ttc_cents bigint not null check (amount_ttc_cents > 0),
  vat_rate numeric(4,3) check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 1)),  -- 0.200, 0.100, 0.055, 0.000

  -- Dates
  issued_at date not null,
  due_at date not null,
  paid_at date,                                -- null tant que non payée

  -- État
  -- "overdue" est dérivé côté UI : status='pending' AND due_at < current_date
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),

  -- Rapprochement (V1 1-to-1 only — V2 ajoutera invoice_payments)
  matched_transaction_id uuid references public.transactions(id) on delete set null,
  match_confidence numeric(4,3)
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),

  -- Métadonnées
  description text,
  source text not null default 'manual'
    check (source in ('manual', 'csv', 'factur_x', 'pdf_ocr')),
  source_file text,
  notes text,

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id),

  unique (company_id, number)
);

create trigger trg_invoices_emitted_updated
  before update on public.invoices_emitted
  for each row execute function public.set_updated_at();

create index idx_invoices_emitted_company_due
  on public.invoices_emitted(company_id, status, due_at);
create index idx_invoices_emitted_company_client
  on public.invoices_emitted(company_id, client_name);
create index idx_invoices_emitted_matched_tx
  on public.invoices_emitted(matched_transaction_id)
  where matched_transaction_id is not null;

-- RLS : scoped to company members like everything else
alter table public.invoices_emitted enable row level security;

create policy "invoices_emitted_company_all" on public.invoices_emitted
  for all using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));
