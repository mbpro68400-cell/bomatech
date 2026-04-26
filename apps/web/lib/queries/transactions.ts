/**
 * Database queries — wrappers around Supabase client.
 *
 * All queries are scoped to the current company (resolved via session/RLS).
 */

import { getBrowserClient } from "../supabase";
import type { FinancialState, Transaction } from "../engines/types";

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
    .limit(limit);

  if (error) {
    console.error("Failed to load transactions:", error);
    return [];
  }
  return (data ?? []) as Transaction[];
}

export async function insertTransactions(
  rows: Omit<Transaction, "id">[],
): Promise<{ inserted: number; errors: string[] }> {
  if (rows.length === 0) return { inserted: 0, errors: [] };

  const supabase = getBrowserClient();
  const errors: string[] = [];

  // Insert in batches of 100 to avoid payload limits
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from("transactions")
      .insert(batch, { count: "exact" });

    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  return { inserted, errors };
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
