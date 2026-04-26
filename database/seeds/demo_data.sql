-- ============================================================
-- Demo data — Atelier Marchand SARL
-- ============================================================
-- Run after migrations. Assumes auth.users is empty; creates a
-- demo user, profile, company, and ~30 transactions spanning 90 days.
-- ============================================================

-- Demo user (password: "demo1234" — only for local dev!)
-- NOTE: in real Supabase, create the user via Auth first, then run this.
do $$
declare
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';
  v_company_id uuid := '22222222-2222-2222-2222-222222222222';
  v_start_date date := current_date - interval '90 days';
begin
  -- Profile
  insert into public.profiles (id, full_name, email)
  values (v_user_id, 'Sophie Marchand', 'sophie@atelier-marchand.fr')
  on conflict (id) do nothing;

  -- Company
  insert into public.companies (id, name, siren, legal_form, vat_number)
  values (v_company_id, 'Atelier Marchand', '852345678', 'SARL', 'FR85852345678')
  on conflict (id) do nothing;

  -- Membership
  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner')
  on conflict do nothing;

  -- Revenue transactions (clients)
  insert into public.transactions (company_id, date, amount_cents, kind, category, counterparty, label, source)
  values
    (v_company_id, v_start_date + 5,   420000, 'revenue', 'client', 'Duval SAS',         'Facture F-2026-170', 'csv'),
    (v_company_id, v_start_date + 12,  184000, 'revenue', 'client', 'Belmont SARL',      'Facture F-2026-171', 'csv'),
    (v_company_id, v_start_date + 18,  680000, 'revenue', 'client', 'Duval SAS',         'Facture F-2026-172', 'csv'),
    (v_company_id, v_start_date + 25,  156000, 'revenue', 'client', 'Mille & Un Concept','Facture F-2026-173', 'csv'),
    (v_company_id, v_start_date + 32,  420000, 'revenue', 'client', 'Duval SAS',         'Facture F-2026-174', 'csv'),
    (v_company_id, v_start_date + 40,   89000, 'revenue', 'client', 'Legrand J.',        'Commande web',       'csv'),
    (v_company_id, v_start_date + 48,  184000, 'revenue', 'client', 'Belmont SARL',      'Facture F-2026-176', 'csv'),
    (v_company_id, v_start_date + 55,  684000, 'revenue', 'client', 'Mille & Un Concept','Facture F-2026-178', 'csv'),
    (v_company_id, v_start_date + 62,  420000, 'revenue', 'client', 'Duval SAS',         'Facture F-2026-180', 'csv'),
    (v_company_id, v_start_date + 75,  184000, 'revenue', 'client', 'Belmont SARL',      'Facture F-2026-182', 'csv'),
    (v_company_id, v_start_date + 88,  420000, 'revenue', 'client', 'Duval SAS',         'Facture F-2026-184', 'csv');

  -- Fixed costs
  insert into public.transactions (company_id, date, amount_cents, kind, category, counterparty, label, source)
  values
    (v_company_id, v_start_date + 1,   -320000, 'cost_fix', 'salaries', 'Marchand Sophie', 'Salaire — Sept',  'csv'),
    (v_company_id, v_start_date + 1,   -148000, 'cost_fix', 'rent',     'SCI Les Forges',  'Loyer atelier',   'csv'),
    (v_company_id, v_start_date + 31,  -320000, 'cost_fix', 'salaries', 'Marchand Sophie', 'Salaire — Oct',   'csv'),
    (v_company_id, v_start_date + 31,  -148000, 'cost_fix', 'rent',     'SCI Les Forges',  'Loyer atelier',   'csv'),
    (v_company_id, v_start_date + 61,  -320000, 'cost_fix', 'salaries', 'Marchand Sophie', 'Salaire — Nov',   'csv'),
    (v_company_id, v_start_date + 61,  -148000, 'cost_fix', 'rent',     'SCI Les Forges',  'Loyer atelier',   'csv'),
    (v_company_id, v_start_date + 5,   -14900,  'cost_fix', 'saas',     'Metabase Cloud',  'Abonnement',      'csv'),
    (v_company_id, v_start_date + 15,  -8000,   'cost_fix', 'saas',     'Notion Labs',     'Team plan',       'csv'),
    (v_company_id, v_start_date + 35,  -14900,  'cost_fix', 'saas',     'Metabase Cloud',  'Abonnement',      'csv'),
    (v_company_id, v_start_date + 45,  -9600,   'cost_fix', 'saas',     'Linear',          'Business plan',   'csv'),
    (v_company_id, v_start_date + 65,  -14900,  'cost_fix', 'saas',     'Metabase Cloud',  'Abonnement',      'csv'),
    (v_company_id, v_start_date + 75,  -18000,  'cost_fix', 'saas',     'Figma',           'Org plan',        'csv');

  -- Variable costs
  insert into public.transactions (company_id, date, amount_cents, kind, category, counterparty, label, source)
  values
    (v_company_id, v_start_date + 8,   -180000, 'cost_var', 'materials', 'Bois Laurent', 'Chêne massif', 'csv'),
    (v_company_id, v_start_date + 22,  -95000,  'cost_var', 'materials', 'Bois Laurent', 'Placage',      'csv'),
    (v_company_id, v_start_date + 38,  -218000, 'cost_var', 'materials', 'Bois Laurent', 'Commande #8421','csv'),
    (v_company_id, v_start_date + 52,  -75000,  'cost_var', 'materials', 'Ferronnerie L.','Quincaillerie','csv'),
    (v_company_id, v_start_date + 70,  -218000, 'cost_var', 'materials', 'Bois Laurent', 'Commande #8442','csv'),
    (v_company_id, v_start_date + 85,  -95000,  'cost_var', 'materials', 'Ferronnerie L.','Accessoires', 'csv');

  -- Taxes & utilities
  insert into public.transactions (company_id, date, amount_cents, kind, category, counterparty, label, source)
  values
    (v_company_id, v_start_date + 15,  -51240,  'cost_fix', 'utilities', 'EDF Pro',            'Électricité Sept', 'csv'),
    (v_company_id, v_start_date + 45,  -51240,  'cost_fix', 'utilities', 'EDF Pro',            'Électricité Oct',  'csv'),
    (v_company_id, v_start_date + 75,  -51240,  'cost_fix', 'utilities', 'EDF Pro',            'Électricité Nov',  'csv'),
    (v_company_id, v_start_date + 20,  -42000,  'cost_fix', 'insurance', 'MAAF Assurances',    'RC Pro T3',        'csv'),
    (v_company_id, v_start_date + 88,  -284700, 'tax',      'social',    'URSSAF IDF',         'Cotisations T4',   'csv');

end $$;
