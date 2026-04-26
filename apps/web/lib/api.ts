/**
 * Typed wrapper around the FastAPI backend.
 * Forwards the Supabase JWT via Authorization header.
 */

import { getBrowserClient } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<HeadersInit> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}${path}`, { headers, credentials: "omit" });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

// ---- Typed endpoints ----

export interface FinancialStateDTO {
  company_id: string;
  as_of: string;
  cash_cents: number;
  revenue_30d: number;
  revenue_90d: number;
  gross_margin_pct: number;
  operating_margin_pct: number;
  runway_months: number | null;
  top_client_name: string | null;
  top_client_share_pct: number;
}

export const api = {
  state: () => apiGet<FinancialStateDTO>("/api/v1/state"),
  transactions: () => apiGet<unknown[]>("/api/v1/transactions"),
  forecast: (months: number) =>
    apiGet<{ points: unknown[] }>(`/api/v1/forecast?months=${months}`),
  insights: () => apiGet<unknown[]>("/api/v1/insights"),
  simulate: (payload: Record<string, unknown>) =>
    apiPost<unknown>("/api/v1/simulate", payload),
};
