/**
 * Tests d'intégration DB pour la migration 0006 (1.6.5 — relances factures).
 *
 * Stratégie identique à period-closure.test.ts :
 *   - chaque test wrappé dans BEGIN ... ROLLBACK
 *   - réutilise le user existant `contact@bomatech.fr` (pas de création
 *     de row dans auth.users, qui exigerait service_role)
 *   - skipped si SUPABASE_DB_URL absent
 *
 * Tests couverts :
 *   1. RLS — un user d'une autre company ne voit aucun reminder
 *   2. Cascade DELETE — supprimer la facture supprime ses reminders
 *   3. Unique constraint — refuse 2 reminders du même palier sur la même invoice
 *   4. Check regex client_email — refuse les formats invalides, accepte les valides
 */

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const SHOULD_RUN = !!dbUrl;

const TEST_USER_EMAIL = "contact@bomatech.fr";

(SHOULD_RUN ? describe : describe.skip)("invoice reminders integration (DB) — migration 0006", () => {
  let client: Client;
  let companyId: string;
  let otherCompanyId: string;
  let userId: string;
  let invoiceId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await client.query("BEGIN");

    const { rows: userRows } = await client.query(
      `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
      [TEST_USER_EMAIL],
    );
    if (userRows.length === 0) {
      throw new Error(`Test setup: user ${TEST_USER_EMAIL} not found in auth.users`);
    }
    userId = userRows[0].id as string;

    // Company de test où l'user est owner
    const { rows: c1 } = await client.query(
      `INSERT INTO public.companies (name, plan) VALUES ('Test reminders — owned', 'trial') RETURNING id`,
    );
    companyId = c1[0].id as string;
    await client.query(
      `INSERT INTO public.company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [companyId, userId],
    );

    // Company de test SANS l'user (pour le test RLS)
    const { rows: c2 } = await client.query(
      `INSERT INTO public.companies (name, plan) VALUES ('Test reminders — other', 'trial') RETURNING id`,
    );
    otherCompanyId = c2[0].id as string;

    // Une facture pending dans la company owned
    const { rows: invRows } = await client.query(
      `INSERT INTO public.invoices_emitted
        (company_id, number, client_name, client_email,
         amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
         issued_at, due_at, status)
       VALUES ($1, 'FAC-TEST-001', 'Client Test', 'client@test.fr',
               100000, 20000, 120000, 0.2,
               '2026-01-01', '2026-02-01', 'pending')
       RETURNING id`,
      [companyId],
    );
    invoiceId = invRows[0].id as string;
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  async function authenticateAsOwner(): Promise<void> {
    await client.query(
      `SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: userId, role: "authenticated" })}'`,
    );
  }

  // ============================================================
  // Test 1 — RLS company-scoped
  // ============================================================
  it("RLS — un user d'une autre company ne voit pas les reminders", async () => {
    // Insert via service_role (sans auth) : on bypass RLS pour seeder le test
    await client.query(
      `INSERT INTO public.invoice_reminders
        (invoice_id, company_id, level, status, scheduled_at,
         email_to, subject, body, created_by)
       VALUES ($1, $2, 1, 'sent', now(),
               'client@test.fr', 'Sujet test', 'Corps test', 'auto')`,
      [invoiceId, companyId],
    );

    // SELECT en se faisant passer pour l'user owner de la company → 1 row
    await authenticateAsOwner();
    const { rows: ownerRows } = await client.query(
      `SELECT id FROM public.invoice_reminders WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(ownerRows.length).toBe(1);

    // Reset auth puis simuler un user qui n'est PAS membre de la company
    await client.query(`RESET "request.jwt.claims"`);
    // On utilise un UUID random qui n'a aucun lien avec une company
    const randomUuid = "00000000-0000-0000-0000-000000000099";
    await client.query(
      `SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: randomUuid, role: "authenticated" })}'`,
    );
    const { rows: outsiderRows } = await client.query(
      `SELECT id FROM public.invoice_reminders WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(outsiderRows.length).toBe(0);
  });

  // ============================================================
  // Test 2 — Cascade DELETE
  // ============================================================
  it("Cascade DELETE — supprimer l'invoice supprime ses reminders", async () => {
    await client.query(
      `INSERT INTO public.invoice_reminders
        (invoice_id, company_id, level, status, scheduled_at,
         email_to, subject, body, created_by)
       VALUES ($1, $2, 1, 'sent', now(),
               'client@test.fr', 'S', 'B', 'auto')`,
      [invoiceId, companyId],
    );

    // Confirme la row existe
    const before = await client.query(
      `SELECT count(*)::int FROM public.invoice_reminders WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(before.rows[0].count).toBe(1);

    // DELETE l'invoice
    await client.query(`DELETE FROM public.invoices_emitted WHERE id = $1`, [invoiceId]);

    // La reminder doit avoir disparu (cascade)
    const after = await client.query(
      `SELECT count(*)::int FROM public.invoice_reminders WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(after.rows[0].count).toBe(0);
  });

  // ============================================================
  // Test 3 — Unique constraint (invoice_id, level)
  // ============================================================
  it("Unique constraint — refuse 2 reminders du même palier sur la même invoice", async () => {
    await client.query(
      `INSERT INTO public.invoice_reminders
        (invoice_id, company_id, level, status, scheduled_at,
         email_to, subject, body, created_by)
       VALUES ($1, $2, 1, 'sent', now(),
               'client@test.fr', 'S1', 'B1', 'auto')`,
      [invoiceId, companyId],
    );

    // 2e palier 1 sur la même invoice → unique violation (23505)
    await expect(
      client.query(
        `INSERT INTO public.invoice_reminders
          (invoice_id, company_id, level, status, scheduled_at,
           email_to, subject, body, created_by)
         VALUES ($1, $2, 1, 'scheduled', now(),
                 'client@test.fr', 'S1bis', 'B1bis', 'auto')`,
        [invoiceId, companyId],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    // En revanche, palier 2 sur la même invoice → OK
    await client.query(
      `INSERT INTO public.invoice_reminders
        (invoice_id, company_id, level, status, scheduled_at,
         email_to, subject, body, created_by)
       VALUES ($1, $2, 2, 'scheduled', now(),
               'client@test.fr', 'S2', 'B2', 'auto')`,
      [invoiceId, companyId],
    );
    const { rows } = await client.query(
      `SELECT level FROM public.invoice_reminders WHERE invoice_id = $1 ORDER BY level`,
      [invoiceId],
    );
    expect(rows.map((r) => r.level)).toEqual([1, 2]);
  });

  // ============================================================
  // Test 4 — Check regex client_email
  // ============================================================
  it("Check regex client_email — accepte valid, refuse invalid, accepte NULL", async () => {
    // NULL accepté
    const { rows: nullRows } = await client.query(
      `INSERT INTO public.invoices_emitted
        (company_id, number, client_name, client_email,
         amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
         issued_at, due_at, status)
       VALUES ($1, 'FAC-NULL-EMAIL', 'Client null', NULL,
               1000, 200, 1200, 0.2,
               '2026-01-01', '2026-02-01', 'pending')
       RETURNING id`,
      [companyId],
    );
    expect(nullRows.length).toBe(1);

    // Email valide accepté
    const { rows: validRows } = await client.query(
      `INSERT INTO public.invoices_emitted
        (company_id, number, client_name, client_email,
         amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
         issued_at, due_at, status)
       VALUES ($1, 'FAC-VALID-EMAIL', 'Client valid', 'foo.bar@example.fr',
               1000, 200, 1200, 0.2,
               '2026-01-01', '2026-02-01', 'pending')
       RETURNING id`,
      [companyId],
    );
    expect(validRows.length).toBe(1);

    // Email sans @ refusé
    await expect(
      client.query(
        `INSERT INTO public.invoices_emitted
          (company_id, number, client_name, client_email,
           amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
           issued_at, due_at, status)
         VALUES ($1, 'FAC-BAD-1', 'Client bad', 'no-at-sign',
                 1000, 200, 1200, 0.2,
                 '2026-01-01', '2026-02-01', 'pending')`,
        [companyId],
      ),
    ).rejects.toMatchObject({ code: "23514" }); // check_violation

    // Email sans point dans le domaine refusé
    await expect(
      client.query(
        `INSERT INTO public.invoices_emitted
          (company_id, number, client_name, client_email,
           amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
           issued_at, due_at, status)
         VALUES ($1, 'FAC-BAD-2', 'Client bad', 'foo@nodot',
                 1000, 200, 1200, 0.2,
                 '2026-01-01', '2026-02-01', 'pending')`,
        [companyId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Email avec espace refusé
    await expect(
      client.query(
        `INSERT INTO public.invoices_emitted
          (company_id, number, client_name, client_email,
           amount_ht_cents, amount_tva_cents, amount_ttc_cents, vat_rate,
           issued_at, due_at, status)
         VALUES ($1, 'FAC-BAD-3', 'Client bad', 'foo bar@example.com',
                 1000, 200, 1200, 0.2,
                 '2026-01-01', '2026-02-01', 'pending')`,
        [companyId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  // (otherCompanyId is created in beforeEach for completeness — reused if besoin futur)
  it("setup smoke — companies/invoice insertés correctement", () => {
    expect(companyId).toBeDefined();
    expect(otherCompanyId).toBeDefined();
    expect(invoiceId).toBeDefined();
    expect(userId).toBeDefined();
  });
});
