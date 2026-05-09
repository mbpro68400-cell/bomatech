/**
 * Database queries — wrappers around Supabase client.
 *
 * All queries are scoped to the current company (resolved via session/RLS).
 */

import { getBrowserClient } from "../supabase";
import type { FinancialState, Transaction } from "../engines/types";
import { runMatchingFor } from "./invoices";

export async function getCurrentCompanyId(): Promise<string | null> {
  const supabase = getBrowserClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", session.session.user.id)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.company_id;
}

export async function listTransactions(
  companyId: string,
  limit = 500,
): Promise<Transaction[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to load transactions:", error);
    return [];
  }
  return (data ?? []) as Transaction[];
}

export async function insertTransactions(
  rows: Omit<Transaction, "id">[],
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: [] };

  const supabase = getBrowserClient();
  const errors: string[] = [];

  // Dedup: a row is a duplicate if (company_id, source_ref) already exists.
  // source_ref is set by rowsToTransactions: real CIC ref (VGxxxx, RUM:, …) for
  // transfers/SEPA, otherwise a synthetic hash of date+amount+label — both
  // stable across re-imports of the same statement.
  const companyId = rows[0].company_id;
  const incomingRefs = rows
    .map((r) => r.source_ref)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  let existing = new Set<string>();
  if (incomingRefs.length > 0) {
    // Chunk the .in() query to avoid URL length issues on large imports.
    const chunkSize = 200;
    for (let i = 0; i < incomingRefs.length; i += chunkSize) {
      const chunk = incomingRefs.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("transactions")
        .select("source_ref")
        .eq("company_id", companyId)
        .in("source_ref", chunk);
      if (error) {
        errors.push(`Dedup check failed: ${error.message}`);
        continue;
      }
      for (const row of data ?? []) {
        if (row.source_ref) existing.add(row.source_ref);
      }
    }
  }

  const toInsert = rows.filter((r) => !r.source_ref || !existing.has(r.source_ref));
  const skipped = rows.length - toInsert.length;

  if (toInsert.length === 0) return { inserted: 0, skipped, errors };

  // Stamp each row with a sequential created_at so the source order
  // (PDF/CSV row order) is preserved when listing same-date rows.
  // Postgres `default now()` evaluates once per statement so without this
  // all rows in a batch would share the exact same created_at.
  const baseMs = Date.now();
  const stamped = toInsert.map((r, i) => ({
    ...r,
    created_at: new Date(baseMs + i).toISOString(),
  })) as (Omit<Transaction, "id"> & { created_at: string })[];

  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < stamped.length; i += batchSize) {
    const batch = stamped.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from("transactions")
      .insert(batch, { count: "exact" });
    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  // Auto-trigger Phase 4 matching after a successful bank-statement import.
  // The new revenue transactions may match existing pending invoices.
  if (inserted > 0) {
    await runMatchingFor(companyId).catch(() => {});
  }

  return { inserted, skipped, errors };
}

export async function getLatestState(companyId: string): Promise<FinancialState | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("financial_states")
    .select("*")
    .eq("company_id", companyId)
    .order("as_of", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as FinancialState;
}

export async function upsertState(state: FinancialState): Promise<boolean> {
  const supabase = getBrowserClient();
  const { error } = await supabase.from("financial_states").upsert(state, {
    onConflict: "company_id,as_of",
  });

  if (error) {
    console.error("Failed to upsert state:", error);
    return false;
  }
  return true;
}
