/**
 * Parser CSV pour factures émises.
 *
 * Auto-détection des colonnes (FR/EN, casse-insensible) avec aliases :
 *  - number        : numero | number | n° | num | ref | reference | référence
 *  - client_name   : client | tiers | nom_client | nom | client_name | name
 *  - amount_ht     : ht | montant_ht | total_ht | ht_eur
 *  - amount_ttc    : ttc | montant_ttc | total_ttc | ttc_eur
 *  - amount_tva    : tva | montant_tva | total_tva | tva_eur (← ce sont des MONTANTS, pas le taux)
 *  - vat_rate      : taux_tva | taux | vat_rate | rate (le TAUX, e.g. "20" ou "0.20" ou "20 %")
 *  - issued_at     : date | date_emission | emission | issued_at | emise
 *  - due_at        : echeance | échéance | due_at | due | date_echeance
 *  - description   : description | libelle | libellé | prestation | designation
 *
 * Logique montants :
 *  - Avec HT + (vat_rate ou TTC) → on calcule le manquant
 *  - Avec TTC + TVA (montant) sans rate → on déduit HT
 *  - Avec TTC seul → si une ligne TVA est explicite et = 0, OK ; sinon erreur (ambigu)
 *
 * Logique dates : ISO `YYYY-MM-DD` ou FR `DD/MM/YYYY` ou `DD-MM-YYYY`.
 *
 * Sortie : ParsedInvoiceRow[] + erreurs ligne par ligne. La page UI dispatche
 * vers bulkInsertInvoices qui dédupe côté DB sur (company_id, number).
 */

import { parseFrenchAmount, parseFrenchDate } from "./cic-parser";

export interface ParsedInvoiceRow {
  number: string;
  client_name: string;
  client_email: string | null;
  amount_ht_cents: number;
  amount_tva_cents: number;
  amount_ttc_cents: number;
  vat_rate: number | null;
  issued_at: string;
  due_at: string;
  description: string | null;
  rawLine: number;
}

export interface ParseInvoiceResult {
  rows: ParsedInvoiceRow[];
  errors: { line: number; message: string }[];
  detectedColumns: Record<string, string>; // canonical → original header
}

const COLUMN_ALIASES: Record<string, string[]> = {
  number: ["numero", "number", "n", "no", "num", "ref", "reference"],
  client_name: ["client", "tiers", "nom_client", "nom", "client_name", "name", "denomination"],
  client_email: ["email", "client_email", "mail", "courriel", "email_client", "contact_email"],
  amount_ht: ["ht", "montant_ht", "total_ht", "ht_eur", "amount_ht", "base_ht"],
  amount_ttc: ["ttc", "montant_ttc", "total_ttc", "ttc_eur", "amount_ttc"],
  amount_tva: ["montant_tva", "total_tva", "tva_eur", "amount_tva"],
  vat_rate: ["taux_tva", "taux", "vat_rate", "rate", "tva_rate"],
  issued_at: ["date", "date_emission", "emission", "issued_at", "issued", "emise", "date_facture"],
  due_at: ["echeance", "due_at", "due", "date_echeance", "date_d_echeance"],
  description: ["description", "libelle", "prestation", "designation", "objet"],
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseInvoiceCsv(text: string): ParseInvoiceResult {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, message: "Fichier vide ou sans ligne d'en-tête" }],
      detectedColumns: {},
    };
  }

  const sep = detectSeparator(lines[0]);
  const headers = lines[0].split(sep).map((h) => normalize(h));

  // Match each canonical column to one of the headers
  const colIdx: Record<string, number> = {};
  const detectedColumns: Record<string, string> = {};
  const originalHeaders = lines[0].split(sep).map((h) => h.trim());
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx !== -1) {
      colIdx[canonical] = idx;
      detectedColumns[canonical] = originalHeaders[idx];
    }
  }

  // Validate mandatory columns
  const required = ["number", "client_name", "issued_at", "due_at"];
  const missing = required.filter((c) => !(c in colIdx));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          message: `Colonnes manquantes : ${missing.join(", ")}. En-têtes lus : ${originalHeaders.join(" | ")}`,
        },
      ],
      detectedColumns,
    };
  }
  const hasHt = "amount_ht" in colIdx;
  const hasTtc = "amount_ttc" in colIdx;
  if (!hasHt && !hasTtc) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          message:
            "Au moins une colonne de montant est requise : 'HT' ou 'TTC'. " +
            `En-têtes lus : ${originalHeaders.join(" | ")}`,
        },
      ],
      detectedColumns,
    };
  }

  const rows: ParsedInvoiceRow[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const lineNo = i + 1;

    try {
      const number = cols[colIdx.number]?.trim();
      const clientName = cols[colIdx.client_name]?.trim();
      const issuedRaw = cols[colIdx.issued_at]?.trim();
      const dueRaw = cols[colIdx.due_at]?.trim();
      const description = "description" in colIdx ? cols[colIdx.description]?.trim() || null : null;
      let clientEmail: string | null = null;
      if ("client_email" in colIdx) {
        const raw = cols[colIdx.client_email]?.trim();
        if (raw) {
          if (EMAIL_RE.test(raw)) clientEmail = raw;
          // Email mal formé : on l'ignore silencieusement (la facture est créée sans email,
          // l'utilisateur peut le saisir plus tard via l'UI). On évite d'échouer toute la ligne.
        }
      }

      if (!number || !clientName) {
        errors.push({ line: lineNo, message: "Numéro ou client manquant" });
        continue;
      }

      const issuedAt = parseDateFlexible(issuedRaw);
      const dueAt = parseDateFlexible(dueRaw);
      if (!issuedAt) {
        errors.push({ line: lineNo, message: `Date d'émission invalide : '${issuedRaw}'` });
        continue;
      }
      if (!dueAt) {
        errors.push({ line: lineNo, message: `Date d'échéance invalide : '${dueRaw}'` });
        continue;
      }
      if (dueAt < issuedAt) {
        errors.push({ line: lineNo, message: "L'échéance est antérieure à l'émission" });
        continue;
      }

      // Resolve amounts
      let htCents = 0;
      let ttcCents = 0;
      let tvaCents = 0;
      let vatRate: number | null = null;

      const rawHt = hasHt ? cols[colIdx.amount_ht]?.trim() : "";
      const rawTtc = hasTtc ? cols[colIdx.amount_ttc]?.trim() : "";
      const rawTva = "amount_tva" in colIdx ? cols[colIdx.amount_tva]?.trim() : "";
      const rawRate = "vat_rate" in colIdx ? cols[colIdx.vat_rate]?.trim() : "";

      if (rawRate) vatRate = parseVatRate(rawRate);

      if (rawHt) htCents = parseFrenchAmount(rawHt);
      if (rawTtc) ttcCents = parseFrenchAmount(rawTtc);
      if (rawTva) tvaCents = parseFrenchAmount(rawTva);

      // Resolve missing values
      if (htCents > 0 && vatRate != null && ttcCents === 0) {
        tvaCents = Math.round(htCents * vatRate);
        ttcCents = htCents + tvaCents;
      } else if (htCents > 0 && tvaCents > 0 && ttcCents === 0) {
        ttcCents = htCents + tvaCents;
        if (htCents > 0) vatRate = vatRate ?? round(tvaCents / htCents, 3);
      } else if (ttcCents > 0 && vatRate != null && htCents === 0) {
        htCents = Math.round(ttcCents / (1 + vatRate));
        tvaCents = ttcCents - htCents;
      } else if (ttcCents > 0 && tvaCents > 0 && htCents === 0) {
        htCents = ttcCents - tvaCents;
        if (htCents > 0) vatRate = vatRate ?? round(tvaCents / htCents, 3);
      } else if (ttcCents > 0 && htCents === 0 && tvaCents === 0 && vatRate == null) {
        // TTC only, no rate, no tva amount → assume 0 % VAT
        htCents = ttcCents;
        tvaCents = 0;
        vatRate = 0;
      } else if (htCents > 0 && ttcCents > 0 && tvaCents === 0) {
        tvaCents = ttcCents - htCents;
        if (htCents > 0) vatRate = vatRate ?? round(tvaCents / htCents, 3);
      }

      if (ttcCents <= 0) {
        errors.push({ line: lineNo, message: "Montant TTC introuvable ou nul" });
        continue;
      }

      // Sanity check : HT + TVA = TTC à 1 cent près
      if (Math.abs(htCents + tvaCents - ttcCents) > 1) {
        errors.push({
          line: lineNo,
          message: `Incohérence montants : HT(${htCents}) + TVA(${tvaCents}) ≠ TTC(${ttcCents})`,
        });
        continue;
      }

      rows.push({
        number,
        client_name: clientName,
        client_email: clientEmail,
        amount_ht_cents: htCents,
        amount_tva_cents: tvaCents,
        amount_ttc_cents: ttcCents,
        vat_rate: vatRate,
        issued_at: issuedAt,
        due_at: dueAt,
        description,
        rawLine: lineNo,
      });
    } catch (e) {
      errors.push({ line: lineNo, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { rows, errors, detectedColumns };
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function parseDateFlexible(s: string): string | null {
  if (!s) return null;
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return isFinite(d.getTime()) ? s : null;
  }
  // FR DD/MM/YYYY or DD-MM-YYYY
  const fr = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (fr) {
    const [, dd, mm, yyyy] = fr;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Fallback to cic-parser's date helper (handles DD/MM/YYYY)
  return parseFrenchDate(s);
}

function parseVatRate(s: string): number | null {
  const cleaned = s.replace(/[%\s ]/g, "").replace(",", ".");
  const v = parseFloat(cleaned);
  if (!isFinite(v) || v < 0) return null;
  // "20" → 0.20, "0.20" → 0.20
  return v > 1 ? v / 100 : v;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
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
