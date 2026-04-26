-- ============================================================
-- Seed : company de test + membership pour contact@bomatech.fr
-- À exécuter dans Supabase SQL Editor (service role)
-- https://supabase.com/dashboard/project/tzufjsdkbrgottnrncrq/sql/new
-- ============================================================

DO $$
DECLARE
  v_user_id   uuid;
  v_company_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; -- UUID fixe pour les tests
BEGIN

  -- 1. Récupérer l'ID de l'utilisateur
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'contact@bomatech.fr';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur contact@bomatech.fr introuvable dans auth.users';
  END IF;

  -- 2. S'assurer que le profil existe (normalement créé par le trigger on_auth_user_created)
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_user_id, 'Mag (test)', 'contact@bomatech.fr')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Créer la company de test
  INSERT INTO public.companies (
    id,
    name,
    siren,
    legal_form,
    vat_number,
    fiscal_year_start_month,
    currency,
    timezone,
    plan
  ) VALUES (
    v_company_id,
    'Bomatech SAS (test)',
    '123456789',
    'SAS',
    'FR51123456789',
    1,        -- exercice janvier → décembre
    'EUR',
    'Europe/Paris',
    'trial'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 4. Lier l'utilisateur à la company (rôle owner)
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner')
  ON CONFLICT (company_id, user_id) DO NOTHING;

  RAISE NOTICE 'OK — company_id=%, user_id=%', v_company_id, v_user_id;
END;
$$;
