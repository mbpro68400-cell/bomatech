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
  opts: { includeClosed?: boolean } = {},
): Promise<Transaction[]> {
  const supabase = getBrowserClient();
  let q = supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId);

  // Phase 1.7 : par défaut on n'inclut PAS les écritures de période close.
  // L'archive (/archives) doit explicitement passer { includeClosed: true }.
  if (!opts.includeClosed) {
    q = q.eq("is_closed_period", false);
  }

  const { data, error } = await q
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

  const afterSrcRefDedup = rows.filter((r) => !r.source_ref || !existing.has(r.source_ref));

  // Second dedup pass : by content key (date + amount + normalized label).
  // Catches duplicates that slipped through source_ref dedup — typically when
  // the same bank movement has been imported once via CSV (source_ref = synthetic
  // hash) and once via PDF (source_ref = native CIC ref like VG40924FLMT58B01).
  // These two source_refs differ → first dedup misses ; the content key
  // (date+amount+normalized label) catches them.
  const contentKey = (date: string, amount: number, label: string) => {
    const norm = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 50);
    return `${date}|${amount}|${norm}`;
  };

  const dates = afterSrcRefDedup.map((r) => r.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const existingContent = new Set<string>();
  if (minDate && maxDate) {
    const { data: existingRows, error: contErr } = await supabase
      .from("transactions")
      .select("date, amount_cents, label")
      .eq("company_id", companyId)
      .gte("date", minDate)
      .lte("date", maxDate);
    if (contErr) {
      errors.push(`Content dedup fetch failed: ${contErr.message}`);
    } else {
      for (const er of existingRows ?? []) {
        existingContent.add(contentKey(er.date as string, er.amount_cents as number, er.label as string));
      }
    }
  }

  // Apply content dedup AND intra-batch dedup (avoid two CSV/PDF files in the same
  // import batch from inserting the same transaction twice).
  const seenInBatch = new Set<string>();
  const toInsert: typeof afterSrcRefDedup = [];
  for (const r of afterSrcRefDedup) {
    const key = contentKey(r.date, r.amount_cents, r.label);
    if (existingContent.has(key)) continue;
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push(r);
  }
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
