# Setup Bomatech — Configuration Supabase + nouvelles fonctionnalités

> Guide pas-à-pas pour brancher ton dashboard sur tes vraies données.

---

## ÉTAPE 1 — Vérifier le schéma Supabase

Va sur ton projet Supabase `bomatech-db` → **Table Editor**.

Tu dois voir ces 10 tables :
- `profiles`, `companies`, `company_members`
- `transactions`, `financial_states`, `insights`
- `simulations`, `forecasts`, `documents`, `audit_log`

### Si tu ne les vois pas → applique le schéma

1. **SQL Editor** → **New query**
2. Ouvre le fichier `database/migrations/0001_initial.sql` dans ton repo GitHub
3. Copie tout son contenu, colle dans l'éditeur Supabase
4. Clique **Run** (Ctrl+Enter)
5. Tu dois voir "Success. No rows returned"

---

## ÉTAPE 2 — Créer ton entreprise dans la base

### A. Récupère ton user_id

**SQL Editor** → New query :

```sql
select id, email from auth.users;
```

**Copie l'UUID** qui correspond à ton email pro de la SARL.

### B. Crée ton entreprise et lie-toi comme owner

Nouvelle query (remplace les `<...>` par tes vraies infos) :

```sql
do $$
declare
  v_company_id uuid := uuid_generate_v4();
  v_user_id uuid := '<COLLE-TON-USER-ID-ICI>';
begin
  -- Adapte avec les vraies infos de ta SARL
  insert into public.companies (id, name, siren, legal_form, vat_number)
  values (
    v_company_id,
    '<NOM DE TA SARL>',           -- ex: 'Atelier Marchand'
    '<SIREN 9 chiffres>',         -- ex: '852345678'
    'SARL',
    '<NUMÉRO TVA optionnel>'      -- ex: 'FR85852345678' ou laisse vide ''
  );

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  raise notice 'Company created with ID: %', v_company_id;
end $$;
```

Lance. Tu dois voir "NOTICE: Company created with ID: xxx-yyy-zzz".

---

## ÉTAPE 3 — Configurer Vercel avec les vraies clés Supabase

### A. Récupère les clés

Sur Supabase → **Settings → API**. Copie :
- **Project URL** (commence par `https://...supabase.co`)
- **anon public** (longue clé `eyJ...`)

### B. Mets-les dans Vercel

[vercel.com/dashboard](https://vercel.com/dashboard) → projet bomatech → **Settings → Environment Variables**.

Pour `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` :
- Clique sur le `...` à droite → **Edit**
- Remplace la valeur placeholder par la vraie clé
- **Save**

⚠️ NE METS PAS la `service_role` dans Vercel. Elle est réservée au backend.

### C. Redéploie

**Deployments** → dernier → `...` → **Redeploy** (sans cache).

---

## ÉTAPE 4 — Tester la connexion

Une fois le redeploy terminé :

1. Va sur **bomatech.vercel.app/login**
2. Entre **ton email pro** (le même que dans `auth.users`)
3. Tu reçois un magic link par email
4. Clique le lien → tu es redirigé sur `/dashboard`
5. Le dashboard affiche "Pas encore de données" (normal, aucune transaction importée)
6. Clique **Importer un relevé →**
7. Glisse ton CSV CIC
8. Vérifie l'aperçu, clique **Importer**
9. Retourne sur `/dashboard` → tes vrais KPI s'affichent ✨

---

## En cas de problème

### "Aucune entreprise associée à ton compte"
→ Tu as zappé l'étape 2.B. Refais-la.

### "Failed to load transactions" / 401 Unauthorized
→ La RLS rejette la requête. Vérifie que ton `auth.uid()` est bien dans `company_members` :
```sql
select * from company_members where user_id = '<TON-USER-ID>';
```

### Le magic link n'arrive pas
→ Va dans Supabase → **Authentication → URL Configuration** :
- **Site URL** : `https://bomatech.vercel.app`
- **Redirect URLs** : ajoute `https://bomatech.vercel.app/dashboard`

### Le CSV CIC n'est pas reconnu
→ Le format varie selon les versions du portail CIC. Envoie-moi 5-10 lignes anonymisées du CSV et j'adapte le parser.
