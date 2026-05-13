"use client";

/**
 * Form /suppliers/new (1.9 — P5b).
 *
 * 1 input universel + auto-détection SIRET/SIREN/nom (LUHN côté client
 * AVANT appel API pour économie crédit Pappers).
 * Trigger explicite (bouton « Rechercher » ou Enter) — pas de
 * search-as-you-type (chaque appel = 1 crédit sur 100/mois).
 *
 * State machine : input → searching → (multi | preview | error)
 *                                    → preview → submitting → redirect
 *
 * Limites V1 : pas de notes, pas de tags, pas de catégorie — édition
 * depuis /suppliers/[id] en V1.5.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";

import { detectInputKind } from "@/lib/utils/siret-detection";
import {
  addSupplier,
  getPappersBySiren,
  searchPappersByName,
  type PappersErrorCode,
} from "./actions";
import type {
  PappersEntrepriseRaw,
  PappersRechercheResultRaw,
} from "@/lib/external/pappers.types";

type Step =
  | { kind: "input" }
  | { kind: "searching" }
  | { kind: "multi"; results: PappersRechercheResultRaw[] }
  | { kind: "preview"; raw: PappersEntrepriseRaw }
  | { kind: "submitting"; raw: PappersEntrepriseRaw }
  | { kind: "error"; message: string };

const SLOW_WARN_MS = 5000;

function formatSirenDisplay(siren: string): string {
  if (siren.length !== 9) return siren;
  return `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6, 9)}`;
}

function formatDateLongFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function relativeAgeYears(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const years = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
  if (years < 1) return "moins d'un an";
  const n = Math.floor(years);
  return `il y a ${n} an${n > 1 ? "s" : ""}`;
}

function pappersErrorMessage(code: PappersErrorCode, isNameSearch: boolean): string {
  switch (code) {
    case "not_found":
      return isNameSearch
        ? "Aucune entreprise trouvée. Affinez votre recherche ou utilisez le SIREN/SIRET."
        : "Aucune entreprise trouvée avec ce numéro. Vérifiez le numéro.";
    case "quota_exceeded":
      return "Quota Pappers atteint pour ce mois. Réessayez le mois prochain ou contactez le support.";
    case "server_error":
      return "Service Pappers indisponible. Réessayez dans quelques instants.";
    case "invalid":
      return "Numéro invalide ou inaccessible.";
    case "unknown":
    default:
      return "Erreur lors de l'appel à Pappers.";
  }
}

interface CriticalStatus {
  reason: string;
}

function detectCriticalStatus(raw: PappersEntrepriseRaw): CriticalStatus | null {
  if (raw.entreprise_cessee === true) {
    return { reason: "cessation d'activité" };
  }
  const statut = raw.statut_rcs?.toLowerCase() ?? "";
  if (statut.includes("radié") || statut.includes("radie")) {
    return { reason: "radiation du RCS" };
  }
  const procOpen = (raw.procedures_collectives ?? []).filter(
    (p) => !p.date_cloture,
  );
  if (procOpen.length > 0) {
    const kind = procOpen[0].type ?? "collective";
    return { reason: `procédure ${kind}` };
  }
  return null;
}

export default function NewSupplierPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>({ kind: "input" });
  const [slowWarn, setSlowWarn] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detection = useMemo(() => detectInputKind(input), [input]);
  const canSearch =
    detection.kind === "siren" ||
    detection.kind === "siret" ||
    detection.kind === "name";

  const inputErrorMessage = useMemo(() => {
    if (input.trim().length === 0) return "";
    if (detection.kind === "invalid") {
      if (detection.reason === "luhn") {
        return "Numéro invalide (clé de contrôle Luhn incorrecte).";
      }
      if (detection.reason === "too_short") {
        return "Saisissez au moins 3 caractères pour la recherche par nom.";
      }
    }
    return "";
  }, [input, detection]);

  function startSlowTimer() {
    setSlowWarn(false);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setSlowWarn(true), SLOW_WARN_MS);
  }

  function clearSlowTimer() {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setSlowWarn(false);
  }

  async function onSearch() {
    if (!canSearch || step.kind === "searching" || step.kind === "submitting") {
      return;
    }
    setStep({ kind: "searching" });
    startSlowTimer();

    try {
      if (detection.kind === "siren" || detection.kind === "siret") {
        const res = await getPappersBySiren(detection.siren);
        if (!res.ok) {
          setStep({
            kind: "error",
            message: pappersErrorMessage(res.code, false),
          });
          return;
        }
        setStep({ kind: "preview", raw: res.raw });
        return;
      }

      // detection.kind === "name"
      const res = await searchPappersByName(detection.query);
      if (!res.ok) {
        setStep({
          kind: "error",
          message: pappersErrorMessage(res.code, true),
        });
        return;
      }
      const results = res.results;
      if (results.length === 0) {
        setStep({
          kind: "error",
          message: pappersErrorMessage("not_found", true),
        });
        return;
      }
      if (results.length === 1) {
        // 1 seul résultat : on enchaîne automatiquement sur la fiche complète.
        const full = await getPappersBySiren(results[0].siren);
        if (!full.ok) {
          setStep({
            kind: "error",
            message: pappersErrorMessage(full.code, false),
          });
          return;
        }
        setStep({ kind: "preview", raw: full.raw });
        return;
      }
      setStep({ kind: "multi", results });
    } finally {
      clearSlowTimer();
    }
  }

  async function onSelectFromMulti(siren: string) {
    if (step.kind !== "multi") return;
    setStep({ kind: "searching" });
    startSlowTimer();
    try {
      const res = await getPappersBySiren(siren);
      if (!res.ok) {
        setStep({
          kind: "error",
          message: pappersErrorMessage(res.code, false),
        });
        return;
      }
      setStep({ kind: "preview", raw: res.raw });
    } finally {
      clearSlowTimer();
    }
  }

  async function onSubmit() {
    if (step.kind !== "preview") return;
    const raw = step.raw;
    setStep({ kind: "submitting", raw });
    startSlowTimer();
    try {
      const res = await addSupplier(raw);
      if (res.ok) {
        router.push(`/suppliers/${res.id}`);
        return;
      }
      if (res.code === "duplicate") {
        router.push(`/suppliers/${res.existingId}`);
        return;
      }
      if (res.code === "unauthorized") {
        setStep({
          kind: "error",
          message: "Session expirée ou aucune company associée. Reconnectez-vous.",
        });
        return;
      }
      setStep({
        kind: "error",
        message: res.message ?? "Erreur lors de l'ajout du fournisseur.",
      });
    } finally {
      clearSlowTimer();
    }
  }

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const isBusy = step.kind === "searching" || step.kind === "submitting";

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <Link
        href="/suppliers"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--fg-muted)",
          fontSize: "var(--fz-sm)",
          marginBottom: 12,
        }}
      >
        <ArrowLeft size={14} />
        Veille fournisseurs
      </Link>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 600 }}>
          Ajouter un fournisseur
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--fg-muted)",
            fontSize: "var(--fz-sm)",
          }}
        >
          Renseignez un SIRET, un SIREN ou un nom d'entreprise. Bomatech
          interroge Pappers pour récupérer la fiche officielle.
        </p>
      </header>

      <SearchForm
        input={input}
        setInput={setInput}
        onSearch={onSearch}
        canSearch={canSearch}
        isBusy={isBusy}
        inputErrorMessage={inputErrorMessage}
      />

      {step.kind === "searching" && (
        <BusyHint slowWarn={slowWarn} label="Interrogation de Pappers…" />
      )}
      {step.kind === "submitting" && (
        <BusyHint slowWarn={slowWarn} label="Ajout du fournisseur en cours…" />
      )}

      {step.kind === "error" && (
        <ErrorBanner
          message={step.message}
          onDismiss={() => setStep({ kind: "input" })}
        />
      )}

      {step.kind === "multi" && (
        <ResultsList
          results={step.results}
          onSelect={onSelectFromMulti}
        />
      )}

      {(step.kind === "preview" || step.kind === "submitting") && (
        <Preview
          raw={step.kind === "preview" ? step.raw : step.raw}
          submitting={step.kind === "submitting"}
          onSubmit={onSubmit}
          onCancel={() => setStep({ kind: "input" })}
        />
      )}
    </div>
  );
}

// ============================================================
// SearchForm
// ============================================================

function SearchForm({
  input,
  setInput,
  onSearch,
  canSearch,
  isBusy,
  inputErrorMessage,
}: {
  input: string;
  setInput: (s: string) => void;
  onSearch: () => void;
  canSearch: boolean;
  isBusy: boolean;
  inputErrorMessage: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSearch && !isBusy) onSearch();
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 24,
      }}
    >
      <label
        htmlFor="supplier-input"
        style={{ fontSize: "var(--fz-sm)", fontWeight: 500 }}
      >
        SIRET (14 chiffres), SIREN (9 chiffres) ou nom du fournisseur
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="supplier-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ex : 572 015 246  ou  Acme Industries"
          autoFocus
          disabled={isBusy}
          style={{
            flex: 1,
            height: "var(--control-h)",
            padding: "0 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--bg-elev)",
            color: "var(--fg)",
            fontSize: "var(--fz-base)",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          className="btn primary"
          disabled={!canSearch || isBusy}
        >
          <Search size={14} />
          Rechercher
        </button>
      </div>
      {inputErrorMessage && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: "var(--danger)",
            fontSize: "var(--fz-sm)",
          }}
        >
          {inputErrorMessage}
        </p>
      )}
    </form>
  );
}

// ============================================================
// BusyHint (spinner + slow warning 5s)
// ============================================================

function BusyHint({ slowWarn, label }: { slowWarn: boolean; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 24,
        color: "var(--fg-muted)",
        fontSize: "var(--fz-sm)",
      }}
    >
      <Loader2
        size={20}
        style={{ animation: "spin 1s linear infinite" }}
        aria-hidden
      />
      <span>{label}</span>
      {slowWarn && (
        <span style={{ fontSize: "var(--fz-xs)", opacity: 0.7 }}>
          Pappers prend plus de temps que prévu, patience…
        </span>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============================================================
// ResultsList (2-10 résultats de recherche par nom)
// ============================================================

function ResultsList({
  results,
  onSelect,
}: {
  results: PappersRechercheResultRaw[];
  onSelect: (siren: string) => void;
}) {
  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
        {results.length} résultats
      </h2>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {results.map((r) => (
          <li key={r.siren}>
            <button
              onClick={() => onSelect(r.siren)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--bg-elev)",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "var(--fg)",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: "var(--fz-base)" }}>
                {r.denomination ?? r.nom_entreprise}
              </div>
              <div
                style={{
                  color: "var(--fg-muted)",
                  fontSize: "var(--fz-sm)",
                  marginTop: 2,
                }}
              >
                SIREN {formatSirenDisplay(r.siren)}
                {r.siege?.ville ? ` · ${r.siege.ville}` : ""}
                {r.forme_juridique ? ` · ${r.forme_juridique}` : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {results.length === 10 && (
        <p
          style={{
            marginTop: 12,
            color: "var(--fg-muted)",
            fontSize: "var(--fz-sm)",
          }}
        >
          10 premiers résultats affichés. Affinez votre recherche pour préciser.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Preview (fiche lecture seule + bouton Ajouter)
// ============================================================

function Preview({
  raw,
  submitting,
  onSubmit,
  onCancel,
}: {
  raw: PappersEntrepriseRaw;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const critical = detectCriticalStatus(raw);
  const dirigeants = (raw.dirigeants ?? raw.representants ?? []).slice(0, 3);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600 }}>
            {raw.denomination ?? raw.nom_entreprise}
          </h2>
          <p
            style={{
              margin: 0,
              color: "var(--fg-muted)",
              fontSize: "var(--fz-sm)",
              fontFamily: "var(--font-mono)",
            }}
          >
            SIREN {formatSirenDisplay(raw.siren)}
          </p>
        </div>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "8px 16px",
            margin: 0,
            fontSize: "var(--fz-sm)",
          }}
        >
          <dt style={{ color: "var(--fg-muted)" }}>Forme juridique</dt>
          <dd style={{ margin: 0 }}>{raw.forme_juridique ?? "—"}</dd>

          <dt style={{ color: "var(--fg-muted)" }}>Code NAF</dt>
          <dd style={{ margin: 0 }}>
            {raw.code_naf
              ? `${raw.code_naf}${raw.libelle_code_naf ? ` — ${raw.libelle_code_naf}` : ""}`
              : "—"}
          </dd>

          <dt style={{ color: "var(--fg-muted)" }}>Statut greffe</dt>
          <dd style={{ margin: 0 }}>{raw.statut_rcs ?? "—"}</dd>

          <dt style={{ color: "var(--fg-muted)" }}>Immatriculation</dt>
          <dd style={{ margin: 0 }}>
            {raw.date_immatriculation_rcs ? (
              <>
                {formatDateLongFr(raw.date_immatriculation_rcs)}{" "}
                <span style={{ color: "var(--fg-muted)" }}>
                  ({relativeAgeYears(raw.date_immatriculation_rcs)})
                </span>
              </>
            ) : (
              "—"
            )}
          </dd>

          <dt style={{ color: "var(--fg-muted)", alignSelf: "start" }}>
            Dirigeants
          </dt>
          <dd style={{ margin: 0 }}>
            {dirigeants.length === 0 ? (
              "—"
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {dirigeants.map((d, i) => (
                  <li key={i}>
                    {d.nom}
                    {d.prenom ? ` ${d.prenom}` : ""}
                    {d.qualite ? ` (${d.qualite})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>

        {critical && <CriticalStatusBanner reason={critical.reason} />}
      </div>

      <footer
        style={{
          padding: 16,
          borderTop: "1px solid var(--border)",
          background: "var(--bg-sunken)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={onCancel}
          disabled={submitting}
        >
          Annuler
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2
              size={14}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Plus size={14} />
          )}
          Ajouter ce fournisseur
        </button>
      </footer>
    </div>
  );
}

// ============================================================
// CriticalStatusBanner
// ============================================================

function CriticalStatusBanner({ reason }: { reason: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 10,
        padding: 12,
        border: "1px solid var(--danger)",
        background: "var(--danger-soft)",
        borderRadius: 8,
        color: "var(--danger)",
        fontSize: "var(--fz-sm)",
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong>Cette entreprise est en {reason}.</strong>
        <br />
        Vous pouvez l'ajouter au suivi à des fins d'historique, mais aucune
        nouvelle alerte ne sera générée tant que cet état persiste (le diff
        ne détecte que les changements).
      </div>
    </div>
  );
}

// ============================================================
// ErrorBanner
// ============================================================

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: 12,
        border: "1px solid var(--danger)",
        background: "var(--danger-soft)",
        borderRadius: 8,
        color: "var(--danger)",
        fontSize: "var(--fz-sm)",
        marginBottom: 16,
      }}
    >
      <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>{message}</div>
      <button
        onClick={onDismiss}
        style={{
          color: "var(--danger)",
          fontSize: "var(--fz-xs)",
          textDecoration: "underline",
        }}
      >
        Fermer
      </button>
    </div>
  );
}
