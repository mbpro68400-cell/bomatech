/**
 * Tests d'intégration DB pour les migrations 0004 + 0005 (périodes comptables)
 * et le hardening 1.7.1 (post-bug fix).
 *
 * Stratégie d'isolation : chaque test wrappé dans BEGIN ... ROLLBACK pour
 * garantir l'isolation totale, même en cas de crash. Aucune donnée ne
 * persiste après le test (rollback systématique).
 *
 * Auth : on simule auth.uid() en posant la JWT claim `sub` dans la session
 * via `SET LOCAL "request.jwt.claims"`. Supabase implémente auth.uid() comme
 * `((current_setting('request.jwt.claims', true)::json) ->> 'sub')::uuid`,
 * donc ce SET LOCAL fait croire à auth.uid() qu'on est l'user passé.
 *
 * User : on réutilise le profile existant de Mag (contact@bomatech.fr) pour
 * éviter de créer un row dans auth.users (qui nécessiterait des privilèges
 * spéciaux). La company de test est créée puis rollback ; le user reste
 * intact.
 *
 * Skipped si SUPABASE_DB_URL (ou DATABASE_URL) est absent. Pour activer :
 *   - Récupère la connection string Postgres en mode "Session" depuis
 *     Supabase Dashboard → Project Settings → Database → Connection string
 *   - Ajoute SUPABASE_DB_URL=postgres://... dans apps/web/.env.local
 *   - pnpm --filter web exec node --env-file=.env.local node_modules/.bin/vitest run
 *     (ou simplement pnpm test si dotenv est résolu)
 *
 * Tests couverts :
 *   1. Trigger flag_closed_period_tx auto-flag à l'INSERT (avant/après last_closing_date)
 *   2. Trigger flag_closed_period_invoice idem côté factures
 *   3. Trigger prevent_modify_archived sur UPDATE archived + escape via session var
 *   4. Trigger prevent_modify_archived sur DELETE archived
 *   5. RPC close_period() refuse hors owner/admin auth (auth check 1ère instruction)
 *   6. Bug 2 — period_start resolution (3 sous-cas : raise / explicit / derived)
 *   7. Bug 3 — double call : 2e appel raise au lieu de créer une closure parasite
 *   8. Bug 1 — cumulative archival : toutes les rows datées ≤ period_end
 *      sont archivées + period_end est stocké exactement comme passé (ISO YYYY-MM-DD)
 */

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const SHOULD_RUN = !!dbUrl;

const TEST_USER_EMAIL = "contact@bomatech.fr";

(SHOULD_RUN ? describe : describe.skip)("period closure integration (DB) — migrations 0004 + 0005", () => {
  let client: Client;
  let companyId: string;
  let userId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await client.query("BEGIN");

    // Reuse existing user from auth.users (FK from profiles requires it).
    // Falls back to skipping the test if not present.
    const { rows: userRows } = await client.query(
      `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
      [TEST_USER_EMAIL],
    );
    if (userRows.length === 0) {
      throw new Error(`Test setup: user ${TEST_USER_EMAIL} not found in auth.users`);
    }
    userId = userRows[0].id as string;

    // Create test company (cascading delete via ROLLBACK)
    const { rows: companyRows } = await client.query(
      `INSERT INTO public.companies (name, plan) VALUES ('Test SARL — 1.7.1', 'trial') RETURNING id`,
    );
    companyId = companyRows[0].id as string;

    // Make our test user the owner
    await client.query(
      `INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [companyId, userId],
    );
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  // Helper : simulate auth.uid() = userId in the current session.
  // Supabase's auth.uid() reads from request.jwt.claims->sub.
  async function authenticateAsOwner(): Promise<void> {
    await client.query(
      `SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: userId, role: "authenticated" })}'`,
    );
  }

  // ============================================================
  // Tests 1-2 : auto-flag triggers at INSERT
  // ============================================================

  it("(1) trigger flag_closed_period_tx flags transactions according to NEW.date <= last_closing_date", async () => {
    await client.query(
      `UPDATE public.companies SET last_closing_date = '2025-12-31', current_period_start = '2026-01-01' WHERE id = $1`,
      [companyId],
    );
    await client.query(
      `INSERT INTO public.transactions (company_id, date, amount_cents, kind, label, source, source_ref)
       VALUES
         ($1, '2025-06-15', 10000, 'revenue', 'TEST archived', 'manual', 'test-arch'),
         ($1, '2026-03-15', 20000, 'revenue', 'TEST open', 'manual', 'test-open')`,
      [companyId],
    );
    const { rows } = await client.query(
      `SELECT date, is_closed_period FROM public.transactions WHERE company_id = $1 ORDER BY date`,
      [companyId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].is_closed_period).toBe(true);
    expect(rows[1].is_closed_period).toBe(false);
  });

  it("(2) trigger flag_closed_period_invoice flags invoices according to NEW.issued_at <= last_closing_date", async () => {
    await client.query(
      `UPDATE public.companies SET last_closing_date = '2025-12-31', current_period_start = '2026-01-01' WHERE id = $1`,
      [companyId],
    );
    await client.query(
      `INSERT INTO public.invoices_emitted (company_id, number, client_name, amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate, issued_at, due_at)
       VALUES
         ($1, 'FAC-ARCH', 'Old client', 10000, 2000, 12000, 0.2, '2025-08-01', '2025-09-01'),
         ($1, 'FAC-OPEN', 'New client', 10000, 2000, 12000, 0.2, '2026-04-01', '2026-05-01')`,
      [companyId],
    );
    const { rows } = await client.query(
      `SELECT number, is_closed_period FROM public.invoices_emitted WHERE company_id = $1 ORDER BY number`,
      [companyId],
    );
    expect(rows.find((r) => r.number === "FAC-ARCH")?.is_closed_period).toBe(true);
    expect(rows.find((r) => r.number === "FAC-OPEN")?.is_closed_period).toBe(false);
  });

  // ============================================================
  // Tests 3-4 : prevent_modify_archived trigger
  // ============================================================

  it("(3) prevent_modify_archived raises on UPDATE of an archived row, unless escape var is set", async () => {
    await client.query(
      `UPDATE public.companies SET last_closing_date = '2025-12-31', current_period_start = '2026-01-01' WHERE id = $1`,
      [companyId],
    );
    await client.query(
      `INSERT INTO public.transactions (company_id, date, amount_cents, kind, label, source)
       VALUES ($1, '2025-06-01', 5000, 'revenue', 'archived tx', 'manual')`,
      [companyId],
    );

    await expect(
      client.query(
        `UPDATE public.transactions SET label = 'modified' WHERE company_id = $1`,
        [companyId],
      ),
    ).rejects.toThrow(/Modification interdite/i);

    await client.query(`SET LOCAL app.allow_archive_modification = 'true'`);
    const result = await client.query(
      `UPDATE public.transactions SET label = 'modified after escape' WHERE company_id = $1`,
      [companyId],
    );
    expect(result.rowCount).toBe(1);
  });

  it("(4) prevent_modify_archived raises on DELETE of an archived row", async () => {
    await client.query(
      `UPDATE public.companies SET last_closing_date = '2025-12-31', current_period_start = '2026-01-01' WHERE id = $1`,
      [companyId],
    );
    await client.query(
      `INSERT INTO public.invoices_emitted (company_id, number, client_name, amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate, issued_at, due_at)
       VALUES ($1, 'FAC-DEL', 'X', 1000, 200, 1200, 0.2, '2025-06-01', '2025-07-01')`,
      [companyId],
    );

    await expect(
      client.query(
        `DELETE FROM public.invoices_emitted WHERE company_id = $1`,
        [companyId],
      ),
    ).rejects.toThrow(/Suppression interdite/i);
  });

  // ============================================================
  // Test 5 : RPC auth check (existant, validé)
  // ============================================================

  it("(5) RPC close_period() requires owner/admin (auth check FIRST INSTRUCTION)", async () => {
    // Pas de SET LOCAL request.jwt.claims → auth.uid() = NULL → not owner/admin
    await expect(
      client.query(
        `SELECT public.close_period($1, '2025-12-31'::date, NULL, '2024-01-01'::date)`,
        [companyId],
      ),
    ).rejects.toThrow(/Forbidden|owner or admin/i);
  });

  // ============================================================
  // Test 6 (NEW) — Bug 2 : period_start resolution (3 sous-cas)
  // ============================================================

  it("(6a) Bug 2 — RPC raises 'period_start required' when company has no current_period_start AND p_period_start is NULL", async () => {
    await authenticateAsOwner();
    await expect(
      client.query(
        `SELECT public.close_period($1, '2024-12-31'::date, NULL, NULL)`,
        [companyId],
      ),
    ).rejects.toThrow(/period_start required for first closure/i);
  });

  it("(6b) Bug 2 — RPC succeeds when current_period_start is NULL but p_period_start is provided explicitly", async () => {
    await authenticateAsOwner();
    const { rows } = await client.query(
      `SELECT (public.close_period($1, '2024-12-31'::date, 'first closure', '2024-01-01'::date)).*`,
      [companyId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].period_start).toBeInstanceOf(Date);
    expect((rows[0].period_start as Date).toISOString().slice(0, 10)).toBe("2024-01-01");
    expect((rows[0].period_end as Date).toISOString().slice(0, 10)).toBe("2024-12-31");
  });

  it("(6c) Bug 2 — RPC derives period_start from current_period_start when not explicitly passed", async () => {
    await authenticateAsOwner();
    // Simulate a company that has already had a closure (current_period_start set)
    await client.query(
      `UPDATE public.companies SET current_period_start = '2025-01-01' WHERE id = $1`,
      [companyId],
    );
    const { rows } = await client.query(
      `SELECT (public.close_period($1, '2025-12-31'::date, 'second closure', NULL)).*`,
      [companyId],
    );
    expect(rows).toHaveLength(1);
    expect((rows[0].period_start as Date).toISOString().slice(0, 10)).toBe("2025-01-01");
    expect((rows[0].period_end as Date).toISOString().slice(0, 10)).toBe("2025-12-31");
  });

  // ============================================================
  // Test 7 (NEW) — Bug 3 : double call doit raise sur le 2nd appel
  // ============================================================

  it("(7) Bug 3 — second call to close_period() with same args raises (no parasitic closure)", async () => {
    await authenticateAsOwner();

    // 1st call : succeeds
    await client.query(
      `SELECT public.close_period($1, '2024-12-31'::date, '1st', '2024-01-01'::date)`,
      [companyId],
    );

    // 2nd call : the 1st closure already updated companies.current_period_start to 2025-01-01.
    // The 2nd call without explicit p_period_start picks 2025-01-01, but p_period_end='2024-12-31'
    // < 2025-01-01 → raises 'period_end must be >= period_start'.
    await expect(
      client.query(
        `SELECT public.close_period($1, '2024-12-31'::date, '2nd attempt', NULL)`,
        [companyId],
      ),
    ).rejects.toThrow(/period_end .* must be >= period_start/i);

    // No additional closure created
    const { rows: closures } = await client.query(
      `SELECT COUNT(*)::int AS c FROM public.accounting_closures WHERE company_id = $1`,
      [companyId],
    );
    expect(closures[0].c).toBe(1);
  });

  // ============================================================
  // Test 8 (NEW) — Bug 1 : cumulative archival + period_end fidélité
  // ============================================================

  it("(8) Bug 1 — close_period() archives ALL rows with date <= period_end (cumulative) and stores period_end as passed", async () => {
    await authenticateAsOwner();

    // Insert tx variées : avant + à la date pivot + après
    await client.query(
      `INSERT INTO public.transactions (company_id, date, amount_cents, kind, label, source, source_ref)
       VALUES
         ($1, '2024-01-15', 10000, 'revenue', 'tx jan',  'manual', 'tx-jan'),
         ($1, '2024-06-30', 20000, 'revenue', 'tx jun',  'manual', 'tx-jun'),
         ($1, '2024-12-31', 30000, 'revenue', 'tx dec',  'manual', 'tx-dec-31'),
         ($1, '2025-01-01', 40000, 'revenue', 'tx jan-2025-01', 'manual', 'tx-jan-2025-01'),
         ($1, '2025-06-15', 50000, 'revenue', 'tx open', 'manual', 'tx-open')`,
      [companyId],
    );

    // Insert invoices variées
    await client.query(
      `INSERT INTO public.invoices_emitted (company_id, number, client_name, amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate, issued_at, due_at)
       VALUES
         ($1, 'FAC-2024-001', 'Client A', 1000, 200, 1200, 0.2, '2024-03-01', '2024-04-01'),
         ($1, 'FAC-2024-002', 'Client B', 2000, 400, 2400, 0.2, '2024-12-31', '2025-01-31'),
         ($1, 'FAC-2025-001', 'Client C', 3000, 600, 3600, 0.2, '2025-02-01', '2025-03-01')`,
      [companyId],
    );

    // Close at 2024-12-31
    const { rows: closure } = await client.query(
      `SELECT (public.close_period($1, '2024-12-31'::date, 'cumulative test', '2024-01-01'::date)).*`,
      [companyId],
    );
    // Period_end stored exactly as passed (no timezone shift, no parsing weirdness)
    expect((closure[0].period_end as Date).toISOString().slice(0, 10)).toBe("2024-12-31");

    // All 3 tx with date <= 2024-12-31 should be archived
    const { rows: archivedTx } = await client.query(
      `SELECT source_ref, is_closed_period FROM public.transactions WHERE company_id = $1 ORDER BY date`,
      [companyId],
    );
    expect(archivedTx.find((r) => r.source_ref === "tx-jan")?.is_closed_period).toBe(true);
    expect(archivedTx.find((r) => r.source_ref === "tx-jun")?.is_closed_period).toBe(true);
    expect(archivedTx.find((r) => r.source_ref === "tx-dec-31")?.is_closed_period).toBe(true);
    expect(archivedTx.find((r) => r.source_ref === "tx-jan-2025-01")?.is_closed_period).toBe(false);
    expect(archivedTx.find((r) => r.source_ref === "tx-open")?.is_closed_period).toBe(false);

    // Both invoices with issued_at <= 2024-12-31 archived
    const { rows: archivedInv } = await client.query(
      `SELECT number, is_closed_period FROM public.invoices_emitted WHERE company_id = $1 ORDER BY number`,
      [companyId],
    );
    expect(archivedInv.find((r) => r.number === "FAC-2024-001")?.is_closed_period).toBe(true);
    expect(archivedInv.find((r) => r.number === "FAC-2024-002")?.is_closed_period).toBe(true);
    expect(archivedInv.find((r) => r.number === "FAC-2025-001")?.is_closed_period).toBe(false);

    // Company state correctly advanced
    const { rows: company } = await client.query(
      `SELECT last_closing_date, current_period_start FROM public.companies WHERE id = $1`,
      [companyId],
    );
    expect((company[0].last_closing_date as Date).toISOString().slice(0, 10)).toBe("2024-12-31");
    expect((company[0].current_period_start as Date).toISOString().slice(0, 10)).toBe("2025-01-01");
  });
});
