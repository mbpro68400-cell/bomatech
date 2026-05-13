/**
 * Client Pappers API v2 + tracking de quota mensuel (1.9 — Veille fournisseurs).
 *
 * V1 :
 *  - plan Gratuit (100 crédits/mois, override possible via PAPPERS_MONTHLY_QUOTA)
 *  - 3 endpoints utilisés :
 *     GET /entreprise?siren=X        (1 crédit, cached intra-run)
 *     GET /recherche?q=X             (1 crédit, résolution nom → SIREN)
 *     GET /suivi-jetons              (probablement 0 crédit, best effort)
 *  - cache intra-run Map<siren, raw> pour éviter de re-fetch un même SIREN
 *    dans une seule exécution du cron (utile si 2 companies surveillent
 *    le même fournisseur)
 *  - retry simple : 1 retry sur 5xx, jamais sur 4xx (4xx = auth/quota/SIREN
 *    inexistant — pas de retry utile)
 *  - quota guard : warning à 80, skip nouveaux polls à 95 sur quota 100
 *    (seuils absolus calibrés pour le plan gratuit ; à ajuster si plan payant)
 *
 * Server-only : la clé API doit rester côté serveur (jamais NEXT_PUBLIC_).
 * Les helpers quota lisent/écrivent dans `pappers_api_usage` (RLS ON sans
 * policy user-side → service_role uniquement via getAdminClient).
 *
 * Architecture pull/push-ready (cf décision Q1) : le client est agnostique
 * du déclencheur. Le cron P6 (pull) et un futur webhook BODACC (push, plan
 * Pro) appellent les mêmes fonctions `getBySiren` + `mapPappersToSnapshot`.
 */

import "server-only";

import { getAdminClient } from "../supabase-admin";
import type {
  Dirigeant,
  PappersSnapshot,
  ProcedureCollectiveKind,
  SupplierStatus,
} from "../engines/types";
import type {
  PappersDirigeantRaw,
  PappersEntrepriseRaw,
  PappersJetonsResponseRaw,
  PappersProcedureCollectiveRaw,
  PappersRechercheResponseRaw,
} from "./pappers.types";

const PAPPERS_BASE_URL = "https://api.pappers.fr/v2";
const DEFAULT_MONTHLY_QUOTA = 100;
const QUOTA_WARNING_THRESHOLD = 80;
const QUOTA_SKIP_THRESHOLD = 95;

// ============================================================
// Env + helpers internes
// ============================================================

function getApiKey(): string {
  const key = process.env.PAPPERS_API_KEY;
  if (!key) {
    throw new Error(
      "Pappers not configured: PAPPERS_API_KEY env var missing (server-only)",
    );
  }
  return key;
}

function getMonthlyQuota(): number {
  const raw = process.env.PAPPERS_MONTHLY_QUOTA;
  if (!raw) return DEFAULT_MONTHLY_QUOTA;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_MONTHLY_QUOTA;
  return parsed;
}

export function currentMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * fetch + 1 retry sur 5xx. 4xx = pas de retry (auth/quota/SIREN inexistant).
 */
async function fetchWithRetry(url: string, retries = 1): Promise<Response> {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { method: "GET" });
    if (res.ok) return res;
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`Pappers ${res.status}: ${await safeText(res)}`);
    }
    lastStatus = res.status;
    lastBody = await safeText(res);
  }
  throw new Error(
    `Pappers ${lastStatus} after ${retries + 1} attempts: ${lastBody}`,
  );
}

// ============================================================
// Client (factory + cache intra-run)
// ============================================================

export interface PappersClient {
  /** GET /entreprise?siren=...  — 1 crédit, cached intra-run par SIREN. */
  getBySiren: (siren: string) => Promise<PappersEntrepriseRaw>;
  /** GET /recherche?q=...  — 1 crédit. */
  searchByName: (query: string) => Promise<PappersRechercheResponseRaw>;
  /** GET /suivi-jetons  — supposé 0 crédit, best effort. */
  getJetonsRemaining: () => Promise<PappersJetonsResponseRaw>;
}

/**
 * Crée un client Pappers avec cache intra-run.
 * Le cache vit dans la closure : 1 client = 1 run de cron = 1 cache jeté
 * en fin d'exécution. Ne PAS partager une instance entre deux cron runs.
 */
export function createPappersClient(): PappersClient {
  const cache = new Map<string, PappersEntrepriseRaw>();

  return {
    async getBySiren(siren: string): Promise<PappersEntrepriseRaw> {
      const cached = cache.get(siren);
      if (cached) return cached;

      const url =
        `${PAPPERS_BASE_URL}/entreprise` +
        `?siren=${encodeURIComponent(siren)}` +
        `&api_token=${encodeURIComponent(getApiKey())}`;
      const res = await fetchWithRetry(url);
      const raw = (await res.json()) as PappersEntrepriseRaw;
      cache.set(siren, raw);
      // Best-effort : si le tracking quota plante, on ne casse pas le poll
      // (la pire conséquence = sous-comptage d'1 crédit pour le mois).
      await incrementPappersUsage(1).catch(() => {});
      return raw;
    },

    async searchByName(query: string): Promise<PappersRechercheResponseRaw> {
      const url =
        `${PAPPERS_BASE_URL}/recherche` +
        `?q=${encodeURIComponent(query)}` +
        `&api_token=${encodeURIComponent(getApiKey())}`;
      const res = await fetchWithRetry(url);
      const raw = (await res.json()) as PappersRechercheResponseRaw;
      await incrementPappersUsage(1).catch(() => {});
      return raw;
    },

    async getJetonsRemaining(): Promise<PappersJetonsResponseRaw> {
      const url =
        `${PAPPERS_BASE_URL}/suivi-jetons` +
        `?api_token=${encodeURIComponent(getApiKey())}`;
      const res = await fetchWithRetry(url);
      // Pas d'incrément (supposé 0 crédit — à confirmer empiriquement P6).
      return (await res.json()) as PappersJetonsResponseRaw;
    },
  };
}

// ============================================================
// Mapper : Pappers raw → PappersSnapshot (domaine)
// ============================================================

function mapProcedureType(
  type: string | undefined,
): ProcedureCollectiveKind | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("sauvegarde")) return "sauvegarde";
  if (t.includes("redressement")) return "redressement";
  if (t.includes("liquidation")) return "liquidation";
  if (t.includes("conciliation")) return "conciliation";
  return null;
}

function mapDirigeants(raw: PappersDirigeantRaw[] = []): Dirigeant[] {
  return raw.map((d) => ({
    nom: d.nom,
    prenom: d.prenom ?? "",
    qualite: d.qualite ?? "",
    depuis: d.date_prise_de_poste ?? null,
  }));
}

function mapAddressSiege(raw: PappersEntrepriseRaw): string | null {
  const siege = raw.siege;
  if (!siege) return null;
  const parts = [
    siege.adresse_ligne_1,
    siege.adresse_ligne_2,
    siege.code_postal,
    siege.ville,
  ].filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join(", ") : null;
}

function mapStatus(raw: PappersEntrepriseRaw): SupplierStatus {
  // Heuristique V1 : à raffiner si Pappers expose un champ statut_greffe
  // plus direct au compte ouvert.
  if (raw.entreprise_cessee === true) return "cessation";
  const statut = raw.statut_rcs?.toLowerCase() ?? "";
  if (statut.includes("radié") || statut.includes("radie")) return "radiation";
  if (statut.includes("inscrit") || statut.includes("actif")) return "active";
  return "unknown";
}

function pickActiveProcedureCollective(
  procedures: PappersProcedureCollectiveRaw[] = [],
): {
  open: boolean;
  kind: ProcedureCollectiveKind | null;
  judgment_date: string | null;
  tribunal: string | null;
} {
  // V1 : on prend la procédure non-clôturée la plus récente par date_jugement.
  const open = procedures.filter((p) => !p.date_cloture);
  if (open.length === 0) {
    return { open: false, kind: null, judgment_date: null, tribunal: null };
  }
  const sorted = [...open].sort((a, b) =>
    (b.date_jugement ?? "").localeCompare(a.date_jugement ?? ""),
  );
  const top = sorted[0];
  return {
    open: true,
    kind: mapProcedureType(top.type),
    judgment_date: top.date_jugement ?? null,
    tribunal: top.tribunal ?? null,
  };
}

/**
 * Convertit la réponse Pappers /entreprise vers le snapshot normalisé stocké
 * en DB (suppliers.last_pappers_snapshot) et consommé par l'engine
 * supplier-diff.
 *
 * Limites V1 :
 *  - last_judgment_date / last_judgment_kind toujours null : la donnée n'est
 *    pas extractible facilement de Pappers v2 (V1.5 via actes BODACC ou v3)
 *  - last_comptes_published_year = max(annee_cloture_exercice) si présent
 *  - capital_cents = raw.capital (supposé en euros) × 100 — à valider P6
 */
export function mapPappersToSnapshot(
  raw: PappersEntrepriseRaw,
): PappersSnapshot {
  const proc = pickActiveProcedureCollective(raw.procedures_collectives);
  const years = (raw.comptes_sociaux ?? [])
    .map((c) => c.annee_cloture_exercice)
    .filter((y): y is number => typeof y === "number");
  const lastYear = years.length > 0 ? Math.max(...years) : null;

  return {
    siren: raw.siren,
    name: raw.denomination ?? raw.nom_entreprise,
    legal_form: raw.forme_juridique ?? null,
    naf_code: raw.code_naf ?? null,
    registration_date: raw.date_immatriculation_rcs ?? null,
    status: mapStatus(raw),
    procedure_collective: {
      open: proc.open,
      kind: proc.kind,
      judgment_date: proc.judgment_date,
      tribunal: proc.tribunal,
      last_judgment_kind: null,
      last_judgment_date: null,
    },
    dirigeants: mapDirigeants(raw.dirigeants ?? raw.representants),
    capital_cents:
      typeof raw.capital === "number" ? Math.round(raw.capital * 100) : null,
    address_siege: mapAddressSiege(raw),
    last_comptes_published_year: lastYear,
    date_cessation: raw.date_cessation ?? null,
    // V1 best effort : Pappers v2 ne documente pas date_radiation directement,
    // certaines réponses exposent date_fin_activite. Null si aucun des deux.
    date_radiation: raw.date_radiation ?? raw.date_fin_activite ?? null,
  };
}

// ============================================================
// Quota tracking (table pappers_api_usage, service_role uniquement)
// ============================================================

export type BudgetStatus = "ok" | "warning" | "skip";

export interface PappersBudget {
  used: number;
  quota: number;
  status: BudgetStatus;
}

async function getOrInitUsageRow(month: string): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("pappers_api_usage")
    .select("calls_count")
    .eq("month", month)
    .maybeSingle();
  if (error) throw new Error(`getOrInitUsageRow: ${error.message}`);
  return (data as { calls_count: number } | null)?.calls_count ?? 0;
}

/**
 * Incrémente le compteur du mois courant. Read-then-write naïf (pas de RPC
 * atomic increment en V1) : OK tant que le cron Vercel est mono-process.
 * Si on parallelise plus tard, passer par une RPC PL/pgSQL avec FOR UPDATE.
 */
export async function incrementPappersUsage(count = 1): Promise<void> {
  const month = currentMonth();
  const current = await getOrInitUsageRow(month);
  const next = current + count;
  const admin = getAdminClient();
  const { error } = await admin.from("pappers_api_usage").upsert(
    { month, calls_count: next, updated_at: new Date().toISOString() },
    { onConflict: "month" },
  );
  if (error) throw new Error(`incrementPappersUsage: ${error.message}`);
}

export async function getCurrentMonthUsage(): Promise<number> {
  return getOrInitUsageRow(currentMonth());
}

export async function getPappersBudgetStatus(): Promise<PappersBudget> {
  const used = await getCurrentMonthUsage();
  const quota = getMonthlyQuota();
  let status: BudgetStatus = "ok";
  if (used >= QUOTA_SKIP_THRESHOLD) status = "skip";
  else if (used >= QUOTA_WARNING_THRESHOLD) status = "warning";
  return { used, quota, status };
}

/**
 * Throw si le budget dépasse `threshold` (default = QUOTA_SKIP_THRESHOLD).
 * Appelée par le cron P6 avant chaque nouveau poll pour arrêter proprement
 * plutôt que de gaspiller des crédits sur des polls qui seraient skip
 * après-coup.
 */
export async function assertPappersBudget(
  threshold = QUOTA_SKIP_THRESHOLD,
): Promise<void> {
  const used = await getCurrentMonthUsage();
  if (used >= threshold) {
    throw new Error(
      `Pappers quota exceeded: ${used}/${getMonthlyQuota()} (threshold=${threshold})`,
    );
  }
}
