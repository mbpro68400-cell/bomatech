-- ============================================================
-- BOMATECH — Initial migration (Supabase / Postgres 16)
-- ============================================================
-- Conventions:
--  * All monetary amounts are stored in CENTS (bigint). Never float for money.
--  * Every table has created_at / updated_at with triggers.
--  * RLS enabled on every table. Access is scoped by company_id.
--  * Timestamps use timestamptz.
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type tx_kind as enum (
  'revenue', 'cost_var', 'cost_fix', 'tax', 'capex', 'financial', 'other'
);

create type tx_source as enum (
  'manual', 'csv', 'ocr_pdf', 'bridge_api', 'api', 'factur_x'
);

create type alert_level as enum ('info', 'warning', 'critical', 'positive');

create type alert_type as enum (
  'cash_risk', 'runway_short', 'concentration', 'margin_negative',
  'cost_anomaly', 'payment_delay', 'margin_improving', 'revenue_growth'
);

create type ocr_status as enum (
  'pending', 'processing', 'done', 'failed', 'needs_review'
);

create type member_role as enum ('owner', 'admin', 'accountant', 'viewer');

-- ============================================================
-- UTILITY: updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. PROFILES & COMPANIES
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  locale text default 'fr-FR',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  siren text unique,
  legal_form text,
  vat_number text,
  fiscal_year_start_month smallint default 1
    check (fiscal_year_start_month between 1 and 12),
  currency text default 'EUR',
  timezone text default 'Europe/Paris',
  plan text default 'trial',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_companies_updated
  before update on public.companies
  for each row execute function public.set_updated_at();

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'owner',
  created_at timestamptz default now(),
  primary key (company_id, user_id)
);

create index idx_company_members_user on public.company_members(user_id);

-- Helper: companies the current user can access
create or replace function public.user_company_ids()
returns setof uuid language sql security definer stable as $$
  select company_id from public.company_members
  where user_id = auth.uid();
$$;

-- ============================================================
-- 2. TRANSACTIONS (source of truth)
-- ============================================================
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,

  date date not null,
  amount_cents bigint not null,                      -- signed: + income / - expense
  currency text not null default 'EUR',
  kind tx_kind not null,
  category text,
  counterparty text,
  label text not null,

  -- VAT
  vat_rate numeric(4,3),                             -- 0.200, 0.100, 0.055, 0.000
  vat_amount_cents bigint,

  -- Provenance
  source tx_source not null default 'manual',
  source_ref text,                                   -- hash du doc, ID bridge...
  document_id uuid,                                  -- FK -> documents (optionnel)

  -- State
  reconciled boolean not null default false,
  dismissed boolean not null default false,
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

create trigger trg_transactions_updated
  before update on public.transactions
  for each row execute function public.set_updated_at();

create index idx_transactions_company_date
  on public.transactions(company_id, date desc);
create index idx_transactions_kind
  on public.transactions(company_id, kind);
create index idx_transactions_counterparty
  on public.transactions(company_id, counterparty)
  where counterparty is not null;

-- ============================================================
-- 3. FINANCIAL STATES (derived snapshots)
-- ============================================================
create table public.financial_states (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  as_of date not null,
  version bigint not null default 1,                 -- monotonic, for optimistic concurrency

  -- Cash
  cash_cents bigint not null default 0,
  cash_30d_avg_cents bigint default 0,

  -- P&L rolling windows
  revenue_30d bigint default 0,
  revenue_90d bigint default 0,
  revenue_365d bigint default 0,
  costs_var_90d bigint default 0,
  costs_fix_90d bigint default 0,

  -- Ratios (computed)
  gross_margin_pct numeric(6,4),
  operating_margin_pct numeric(6,4),

  -- VAT
  vat_collected_quarter_cents bigint default 0,
  vat_deductible_quarter_cents bigint default 0,
  vat_balance_cents bigint default 0,

  -- Trajectory
  burn_rate_monthly_cents bigint default 0,
  runway_months numeric(6,2),

  -- Concentration
  top_client_name text,
  top_client_share_pct numeric(5,4),

  -- Meta
  transaction_count integer default 0,
  last_transaction_at timestamptz,
  computed_at timestamptz default now(),
  created_at timestamptz default now(),

  unique (company_id, as_of)
);

create index idx_financial_states_company
  on public.financial_states(company_id, as_of desc);

-- ============================================================
-- 4. INSIGHTS (Decision Engine output)
-- ============================================================
create table public.insights (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  level alert_level not null,
  type alert_type not null,
  title text not null,
  facts jsonb not null,                              -- raw numbers, for LLM & UI
  message text,                                      -- LLM-generated human text
  source_refs uuid[] default '{}',                   -- transaction IDs

  dismissed boolean not null default false,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id),

  detected_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_insights_updated
  before update on public.insights
  for each row execute function public.set_updated_at();

create index idx_insights_company_level
  on public.insights(company_id, dismissed, level);
create index idx_insights_type
  on public.insights(company_id, type);

-- ============================================================
-- 5. SIMULATIONS (saved what-if scenarios)
-- ============================================================
create table public.simulations (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,

  -- Scenario params (validated by Pydantic in API)
  params jsonb not null,                             -- {revenue_delta_pct, charges_delta_cents, ...}
  horizon_months smallint not null default 6,

  -- Result snapshot
  result jsonb,                                      -- {baseline: [...], scenario: [...], summary: {...}}
  explanation text,                                  -- LLM explanation

  baseline_state_id uuid references public.financial_states(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

create trigger trg_simulations_updated
  before update on public.simulations
  for each row execute function public.set_updated_at();

create index idx_simulations_company
  on public.simulations(company_id, created_at desc);

-- ============================================================
-- 6. FORECASTS (cached projections)
-- ============================================================
create table public.forecasts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  horizon_months smallint not null,
  method text not null,                              -- 'ewma_linear', 'naive', 'seasonal'
  points jsonb not null,                             -- [{month_index, cash_cents, revenue_cents, ...}]
  computed_at timestamptz default now(),
  state_version bigint not null,                     -- links to financial_states.version
  created_at timestamptz default now()
);

create index idx_forecasts_company
  on public.forecasts(company_id, computed_at desc);

-- ============================================================
-- 7. DOCUMENTS (uploaded files + OCR)
-- ============================================================
create table public.documents (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,

  filename text not null,
  storage_path text not null,                        -- supabase storage key
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,

  ocr_status ocr_status not null default 'pending',
  ocr_result jsonb,                                  -- structured extraction
  ocr_confidence numeric(4,3),
  ocr_error text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id),

  unique (company_id, checksum_sha256)               -- prevents double-import
);

create trigger trg_documents_updated
  before update on public.documents
  for each row execute function public.set_updated_at();

create index idx_documents_company_status
  on public.documents(company_id, ocr_status);

-- FK from transactions to documents (added after table exists)
alter table public.transactions
  add constraint fk_tx_document
  foreign key (document_id) references public.documents(id) on delete set null;

-- ============================================================
-- 8. AUDIT LOG
-- ============================================================
create table public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,                              -- 'tx.create', 'state.recompute', ...
  entity_type text,
  entity_id uuid,
  diff jsonb,                                        -- before/after
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create index idx_audit_company_created
  on public.audit_log(company_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.transactions enable row level security;
alter table public.financial_states enable row level security;
alter table public.insights enable row level security;
alter table public.simulations enable row level security;
alter table public.forecasts enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: users can only see/edit their own
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- Companies: scoped via company_members
create policy "companies_member_select" on public.companies
  for select using (id in (select public.user_company_ids()));
create policy "companies_owner_update" on public.companies
  for update using (id in (
    select company_id from public.company_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  ));

-- Company members: see your own memberships
create policy "company_members_self_select" on public.company_members
  for select using (
    user_id = auth.uid()
    or company_id in (select public.user_company_ids())
  );

-- Generic company-scoped policy (used by most tables below)
-- Transactions
create policy "transactions_company_select" on public.transactions
  for select using (company_id in (select public.user_company_ids()));
create policy "transactions_company_insert" on public.transactions
  for insert with check (company_id in (select public.user_company_ids()));
create policy "transactions_company_update" on public.transactions
  for update using (company_id in (select public.user_company_ids()));
create policy "transactions_company_delete" on public.transactions
  for delete using (company_id in (
    select company_id from public.company_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  ));

-- Financial states: read-only from the app, writes go through service role
create policy "financial_states_company_select" on public.financial_states
  for select using (company_id in (select public.user_company_ids()));

-- Insights
create policy "insights_company_select" on public.insights
  for select using (company_id in (select public.user_company_ids()));
create policy "insights_company_update" on public.insights
  for update using (company_id in (select public.user_company_ids()));

-- Simulations (users can create/read/update their own company's)
create policy "simulations_company_all" on public.simulations
  for all using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Forecasts: read-only
create policy "forecasts_company_select" on public.forecasts
  for select using (company_id in (select public.user_company_ids()));

-- Documents
create policy "documents_company_all" on public.documents
  for all using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Audit log: read only for admins
create policy "audit_log_admin_select" on public.audit_log
  for select using (company_id in (
    select company_id from public.company_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  ));

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN UP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
