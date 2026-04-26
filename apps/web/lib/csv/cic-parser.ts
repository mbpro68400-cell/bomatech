/**
 * Parser CSV CIC.
 *
 * Format typique CIC :
 *   - Encodage : Windows-1252 (ISO-Latin-1)
 *   - Séparateur : ;
 *   - Header : Date opération;Date valeur;Montant;Libellé;Solde
 *     (variantes : "Date";"Libellé";"Débit";"Crédit";"Solde")
 *   - Date : JJ/MM/AAAA
 *   - Montants : virgule décimale, parfois entre guillemets, sans symbole €
 *   - Débit = négatif, Crédit = positif (ou 2 colonnes séparées selon export)
 *
 * On essaie de gérer les 2 variantes les plus courantes.
 */

import type { Transaction, TxKind } from "../engines/types";

export interface ParsedRow {
  date: string; // ISO YYYY-MM-DD
  amount_cents: number; // signed
  label: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; message: string }[];
  detectedFormat: "single-amount" | "debit-credit" | "unknown";
}

/**
 * Parse a CIC CSV file content. Returns rows + errors + detected format.
 */
export function parseCicCsv(text: string): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 0, message: "Fichier vide ou sans en-tête" }], detectedFormat: "unknown" };
  }

  const headerLine = lines[0];
  const sep = detectSeparator(headerLine);
  const headers = headerLine.split(sep).map((h) => normalize(h));

  const dateIdx = findColumn(headers, ["date", "date operation", "date d'operation", "date opération"]);
  const labelIdx = findColumn(headers, ["libelle", "libellé", "designation", "description", "operation"]);
  const amountIdx = findColumn(headers, ["montant", "amount"]);
  const debitIdx = findColumn(headers, ["debit", "débit"]);
  const creditIdx = findColumn(headers, ["credit", "crédit"]);

  if (dateIdx === -1 || labelIdx === -1) {
    return {
      rows: [],
      errors: [{ line: 0, message: `En-têtes non reconnues. Trouvé : ${headers.join(", ")}` }],
      detectedFormat: "unknown",
    };
  }

  const detectedFormat: ParseResult["detectedFormat"] =
    amountIdx !== -1 ? "single-amount" : debitIdx !== -1 && creditIdx !== -1 ? "debit-credit" : "unknown";

  if (detectedFormat === "unknown") {
    return {
      rows: [],
      errors: [{ line: 0, message: "Aucune colonne de montant détectée" }],
      detectedFormat,
    };
  }

  const rows: ParsedRow[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = parseCsvLine(line, sep);

    try {
      const dateStr = cols[dateIdx]?.trim();
      const label = cols[labelIdx]?.trim() ?? "";

      if (!dateStr || !label) {
        errors.push({ line: i + 1, message: "Date ou libellé manquant" });
        continue;
      }

      const date = parseFrenchDate(dateStr);
      if (!date) {
        errors.push({ line: i + 1, message: `Date invalide : ${dateStr}` });
        continue;
      }

      let amountCents = 0;
      if (detectedFormat === "single-amount") {
        const raw = cols[amountIdx]?.trim();
        if (!raw) {
          errors.push({ line: i + 1, message: "Montant vide" });
          continue;
        }
        amountCents = parseFrenchAmount(raw);
      } else {
        const debit = cols[debitIdx]?.trim() ?? "";
        const credit = cols[creditIdx]?.trim() ?? "";
        if (debit && debit !== "0" && debit !== "0,00") {
          amountCents = -Math.abs(parseFrenchAmount(debit));
        } else if (credit) {
          amountCents = Math.abs(parseFrenchAmount(credit));
        } else {
          errors.push({ line: i + 1, message: "Débit et crédit vides" });
          continue;
        }
      }

      const raw: Record<string, string> = {};
      headers.forEach((h, idx) => {
        raw[h] = cols[idx] ?? "";
      });

      rows.push({ date, amount_cents: amountCents, label, raw });
    } catch (e) {
      errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { rows, errors, detectedFormat };
}

/**
 * Convert ParsedRows to Transactions (auto-categorization based on label patterns).
 */
export function rowsToTransactions(
  rows: ParsedRow[],
  companyId: string,
): Omit<Transaction, "id">[] {
  return rows.map((r) => ({
    company_id: companyId,
    date: r.date,
    amount_cents: r.amount_cents,
    currency: "EUR",
    kind: classifyTransaction(r.label, r.amount_cents),
    category: detectCategory(r.label),
    counterparty: extractCounterparty(r.label),
    label: r.label,
    source: "csv" as const,
    source_ref: hashRow(r),
    reconciled: false,
  }));
}

// ---------- Heuristiques ----------

function classifyTransaction(label: string, amountCents: number): TxKind {
  const l = label.toLowerCase();

  if (amountCents > 0) {
    return "revenue";
  }

  if (/loyer|edf|gdf|engie|orange|sfr|free|bouygues|sosh|mutuelle|assurance|abonnement|saas|salaire/i.test(l)) {
    return "cost_fix";
  }
  if (/urssaf|impot|tva|cfe|tax/i.test(l)) {
    return "tax";
  }
  if (/interet|interets|emprunt|pret|credit/i.test(l)) {
    return "financial";
  }
  return "cost_var";
}

function detectCategory(label: string): string | null {
  const l = label.toLowerCase();
  if (/salaire|paie/i.test(l)) return "salaires";
  if (/loyer|location/i.test(l)) return "loyer";
  if (/edf|gdf|engie|electric|gaz|eau/i.test(l)) return "utilités";
  if (/orange|sfr|free|bouygues|sosh|telecom/i.test(l)) return "télécom";
  if (/mutuelle|assurance|maaf|maif|axa|allianz/i.test(l)) return "assurance";
  if (/urssaf|cipav|rsi/i.test(l)) return "social";
  if (/impot|tax|cfe|cvae|tva/i.test(l)) return "fiscal";
  if (/saas|adobe|microsoft|google|notion|slack|stripe|figma|github|vercel/i.test(l)) return "saas";
  if (/restaurant|repas|brasserie|cafe/i.test(l)) return "restauration";
  if (/sncf|train|uber|taxi|essence|carburant|peage/i.test(l)) return "transport";
  if (/amazon|fnac|cdiscount|achat/i.test(l)) return "matériels";
  return null;
}

function extractCounterparty(label: string): string | null {
  // Heuristique : mots en majuscules en début de libellé sont souvent le tiers
  const cleaned = label.replace(/^(VIR|PRLV|PAIEMENT|CB|CHQ|VRT|DEP)\s+/i, "");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  // Prend les 1-3 premiers mots qui ressemblent à un nom (majuscules)
  const candidate = words.slice(0, 3).join(" ");
  return candidate.length > 0 && candidate.length < 80 ? candidate : null;
}

// ---------- Utilitaires ----------

function detectSeparator(line: string): string {
  const counts = {
    ";": (line.match(/;/g) ?? []).length,
    ",": (line.match(/,/g) ?? []).length,
    "\t": (line.match(/\t/g) ?? []).length,
  };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ";") as string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip accents
    .replace(/^["']+|["']+$/g, "") // Strip surrounding quotes
    .trim();
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const cn = normalize(c);
    const idx = headers.findIndex((h) => h === cn || h.includes(cn));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseFrenchDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function parseFrenchAmount(s: string): number {
  // "1 234,56" -> 123456 cents
  // "-1234.56" -> -123456 cents
  // "1.234,56" -> 123456 cents (handles dot as thousand sep)
  const cleaned = s
    .replace(/[€\s\u00a0\u202f"']/g, "") // strip currency, spaces, quotes
    .replace(/\.(\d{3})/g, "$1") // 1.234,56 -> 1234,56
    .replace(",", "."); // 123,45 -> 123.45

  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new Error(`Montant illisible : ${s}`);
  }
  return Math.round(value * 100);
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function hashRow(r: ParsedRow): string {
  // Cheap hash to dedupe imports (date + amount + label)
  return `${r.date}_${r.amount_cents}_${r.label.slice(0, 30)}`.replace(/\s/g, "");
}
