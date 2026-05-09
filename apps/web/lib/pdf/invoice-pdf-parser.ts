/**
 * Parser PDF de factures émises — V1, regex/heuristiques.
 *
 * Stratégie : on extrait le texte du PDF avec unpdf (en mode mergePages, qui
 * donne du texte plat avec espaces conservés mais peu de newlines), puis on
 * cherche les champs via patterns alternatifs.
 *
 * Calibré sur les factures Dext (format observé sur l'échantillon de Mag) :
 *   - "N° de facture: FAC-XXXX-XXX"
 *   - "Date d'émission: DD/MM/YYYY"
 *   - "Date d'échéance: DD/MM/YYYY"
 *   - bloc "Destinataire <CLIENT> Adresse de facturation..."
 *   - "Sous-total <HT> €", "TVA <pct> % <TVA> €", "Total <TTC> €"
 *
 * Les autres formats (Pennylane, Tiime, etc.) peuvent partiellement marcher
 * via les patterns alternatifs ; quand un champ ne match pas, on retourne
 * null pour ce champ et l'UI ouvre le formulaire pré-rempli pour correction
 * manuelle (jamais d'auto-création silencieuse de facture incomplète).
 *
 * V1 ne fait PAS d'OCR : un PDF scanné (image-only, < ~50 chars de texte
 * extrait) est rejeté avec un message clair.
 */

import { extractText } from "unpdf";

export interface ParsedInvoiceFromPdf {
  number: string | null;
  client_name: string | null;
  amount_ht_cents: number | null;
  amount_tva_cents: number | null;
  amount_ttc_cents: number | null;
  vat_rate: number | null;
  issued_at: string | null;
  due_at: string | null;
  rawText: string;
}

export interface ParseInvoicePdfResult {
  invoice: ParsedInvoiceFromPdf;
  warnings: string[];
  isReady: boolean; // true si tous les champs requis ont été extraits ET cohérents
}

const VALID_VAT_RATES = [0, 0.055, 0.1, 0.2];

export async function parseInvoicePdf(file: File): Promise<ParseInvoicePdfResult> {
  const buffer = await file.arrayBuffer();
  let text = "";
  try {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    text = typeof result.text === "string" ? result.text : (result.text as string[]).join(" ");
  } catch (e) {
    throw new Error(
      `Lecture PDF impossible : ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!text || text.trim().length < 50) {
    throw new Error(
      "PDF scanné détecté (peu ou pas de texte extractible). Utilise la saisie manuelle ou l'import CSV en attendant la V1.5 OCR.",
    );
  }

  const flat = normalizeWhitespace(text);

  const number = extractNumber(flat);
  const client_name = extractClient(flat);
  const issued_at = extractDate(flat, [
    /date\s+d[''′]?[ée]mission\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /date\s+facture\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /facture\s+du\s+(\d{2}\/\d{2}\/\d{4})/i,
    /[ée]mise\s+le\s+(\d{2}\/\d{2}\/\d{4})/i,
    /en\s+date\s+du\s+(\d{2}\/\d{2}\/\d{4})/i,                  // Henrri-style "En date du"
    /(?:^|\s)le\s+(\d{2}\/\d{2}\/\d{4})\s*[\.,]/i,              // "Le DD/MM/YYYY,"
  ]);
  const due_at = extractDate(flat, [
    /date\s+d[''′]?[ée]ch[ée]ance\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /[ée]ch[ée]ance\s*[:\s]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /[àa]\s+(?:payer|r[ée]gler)\s+(?:avant\s+)?(?:le\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    /net\s+[àa]\s+(?:payer|r[ée]gler)\s+(?:avant\s+)?(?:le\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    /date\s+limite\s*[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
  ]);
  const amounts = extractAmounts(flat);

  const invoice: ParsedInvoiceFromPdf = {
    number,
    client_name,
    amount_ht_cents: amounts.ht,
    amount_tva_cents: amounts.tva,
    amount_ttc_cents: amounts.ttc,
    vat_rate: amounts.vat_rate,
    issued_at,
    due_at,
    rawText: text,
  };

  const warnings = validateInvoice(invoice);
  return {
    invoice,
    warnings,
    isReady: warnings.length === 0,
  };
}

// ---------- Field extractors ----------

function extractNumber(text: string): string | null {
  const patterns = [
    /n°?\s*(?:de\s*)?facture\s*[:\s]+([A-Z0-9_/-]+)/i,
    /facture\s+n°?\s*[:\s]+([A-Z0-9_/-]+)/i,
    /invoice\s+(?:no|number|#)\s*[:\s]+([A-Z0-9_/-]+)/i,
    /r[ée]f[ée]rence\s+facture\s*[:\s]+([A-Z0-9_/-]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractClient(text: string): string | null {
  // Pattern Dext : "Destinataire <CLIENT> Adresse de facturation"
  const dext = text.match(/destinataire\s+(.+?)\s+(?:adresse\s+de\s+facturation|adress[ée]\s+[àa]|n°\s+siren|\d{1,2}[\s,]+(?:rue|avenue|boulevard|chemin|impasse|all[ée]e))/i);
  if (dext && dext[1]) return cleanLine(dext[1]);

  // Patterns avec libellés explicites : "Facturé à : CLIENT" ou "Client : CLIENT"
  // Le ':' est OBLIGATOIRE pour distinguer le label d'une simple occurrence du mot
  // (ex: "facture à la date de paiement" ne doit PAS matcher).
  const alts = [
    /factur[ée]\s+[àa]\s*:\s*([^\n]{2,80}?)(?=\s+(?:adresse|n°|siret|siren|date|description))/i,
    /client\s*:\s*([^\n]{2,80}?)(?=\s+(?:adresse|n°|siret|siren|date|description))/i,
    /adress[ée]\s+[àa]\s*:\s*([^\n]{2,80}?)(?=\s+(?:adresse|n°|siret|siren|date|description))/i,
  ];
  for (const re of alts) {
    const m = text.match(re);
    if (m && m[1]) return cleanLine(m[1]);
  }

  // Pattern Henrri/FacturAqui : après "À régler avant le DATE." ou similaire, capture
  // le bloc en MAJUSCULES (au moins 3 chars, ALL CAPS — accents inclus) qui précède
  // une adresse "X rue|avenue|...". Strictement majuscule pour éviter de capturer
  // l'article "la" / "le" / "à" depuis le texte courant.
  const STREET_KW = "(?:rue|avenue|av\\.|boulevard|bd\\.|chemin|impasse|all[ée]e|place|square|cours|route|rte\\.|quai|esplanade|voie|passage|sentier)";
  const UC = "A-ZÀ-ÖØ-Þ"; // uppercase Latin + accents (U+00C0..U+00D6, U+00D8..U+00DE)

  // Pattern primaire : ancré sur "À régler/payer avant le DATE." → CLIENT + adresse
  const afterDueLabel = text.match(
    new RegExp(
      `[Àà]\\s+(?:r[ée]gler|payer)\\s+(?:avant\\s+)?(?:le\\s+)?\\d{2}\\/\\d{2}\\/\\d{4}[\\s.]+([${UC}][${UC}0-9 \\-&'.]{2,60}?)\\s+\\d{1,4}\\s+${STREET_KW}\\b`,
      "iu",
    ),
  );
  if (afterDueLabel && afterDueLabel[1]) {
    const candidate = cleanLine(afterDueLabel[1]);
    if (candidate.length >= 3 && !/^bomatech$/i.test(candidate)) return candidate;
  }

  // Fallback : 1er nom ALL-CAPS suivi d'une adresse, en excluant l'émetteur (Bomatech)
  const candidatesRe = new RegExp(
    `\\b([${UC}][${UC}0-9 \\-&'.]{2,60}?)\\s+\\d{1,4}\\s+${STREET_KW}\\b`,
    "gu",
  );
  const matches = [...text.matchAll(candidatesRe)];
  for (const m of matches) {
    const candidate = cleanLine(m[1]).replace(/[,;]+$/, "").trim();
    if (!candidate || /^bomatech$/i.test(candidate)) continue;
    if (candidate.length < 3) continue;
    return candidate;
  }
  return null;
}

function extractDate(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const iso = parseFrenchDateToIso(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

interface ExtractedAmounts {
  ht: number | null;
  tva: number | null;
  ttc: number | null;
  vat_rate: number | null;
}

function extractAmounts(text: string): ExtractedAmounts {
  // Sous-total (HT)
  let ht: number | null = null;
  const htMatch = text.match(/sous[\s-]?total\s*[:]?\s*([\d  .,\s]+?)\s*€/i)
    ?? text.match(/total\s+ht\s*[:]?\s*([\d  .,\s]+?)\s*€/i)
    ?? text.match(/montant\s+ht\s*[:]?\s*([\d  .,\s]+?)\s*€/i);
  if (htMatch) ht = toCents(htMatch[1]);

  // TVA pct + amount : "TVA 0.0 % 0,00 €" or "TVA 20,0 % 100,00 €"
  let tva: number | null = null;
  let vat_rate: number | null = null;
  const tvaMatch = text.match(/tva\s+(?:[àa@]|de)?\s*([\d.,]+)\s*%\s+([\d  .,\s]+?)\s*€/i);
  if (tvaMatch) {
    vat_rate = parseRate(tvaMatch[1]);
    tva = toCents(tvaMatch[2]);
  } else {
    // Just amount or just rate
    const tvaAmount = text.match(/(?:montant\s+)?tva\s*[:]?\s*([\d  .,\s]+?)\s*€/i);
    if (tvaAmount) tva = toCents(tvaAmount[1]);
    const rateAlone = text.match(/taux\s+(?:de\s+)?tva\s*[:]?\s*([\d.,]+)\s*%/i);
    if (rateAlone) vat_rate = parseRate(rateAlone[1]);
  }

  // Total (TTC) — prend la dernière occurrence pour éviter de matcher "Sous-total"
  let ttc: number | null = null;
  // First try explicit labels
  const explicitTtc = text.match(/(?:total\s+ttc|net\s+[àa]\s+payer|montant\s+ttc)\s*[:]?\s*([\d  .,\s]+?)\s*€/i);
  if (explicitTtc) {
    ttc = toCents(explicitTtc[1]);
  } else {
    // Take the LAST "Total <amount> €" occurrence (Dext puts plain "Total <ttc>" at the end)
    const all = [...text.matchAll(/(?:^|\s)total\s+([\d  .,\s]+?)\s*€/gi)];
    if (all.length > 0) {
      const last = all[all.length - 1];
      ttc = toCents(last[1]);
    }
  }

  // If we have HT + vat_rate but no TVA amount, derive
  if (ht != null && vat_rate != null && tva == null) {
    tva = Math.round(ht * vat_rate);
  }
  // If we have HT + TTC but no TVA, derive
  if (ht != null && ttc != null && tva == null) {
    tva = ttc - ht;
  }
  // If TTC unknown but HT + TVA present, derive
  if (ht != null && tva != null && ttc == null) {
    ttc = ht + tva;
  }
  // If we have TTC but no HT and rate is 0, HT = TTC and TVA = 0 (case "TVA non applicable")
  if (ttc != null && ht == null && (vat_rate === 0 || (tva === 0 && vat_rate == null))) {
    ht = ttc;
    tva = 0;
    if (vat_rate == null) vat_rate = 0;
  }

  return { ht, tva, ttc, vat_rate };
}

// ---------- Validators ----------

function validateInvoice(p: ParsedInvoiceFromPdf): string[] {
  const warnings: string[] = [];

  if (!p.number) warnings.push("Numéro de facture introuvable");
  if (!p.client_name) warnings.push("Nom du client introuvable");
  if (!p.issued_at) warnings.push("Date d'émission introuvable");
  if (!p.due_at) warnings.push("Date d'échéance introuvable");

  if (p.amount_ttc_cents == null || p.amount_ttc_cents <= 0) {
    warnings.push("Montant TTC introuvable ou nul");
  }
  if (p.amount_ht_cents == null) warnings.push("Montant HT introuvable");
  if (p.amount_tva_cents == null) warnings.push("Montant TVA introuvable");

  if (
    p.amount_ht_cents != null &&
    p.amount_tva_cents != null &&
    p.amount_ttc_cents != null
  ) {
    const sum = p.amount_ht_cents + p.amount_tva_cents;
    if (Math.abs(sum - p.amount_ttc_cents) > 1) {
      warnings.push(
        `Incohérence : HT (${p.amount_ht_cents/100}€) + TVA (${p.amount_tva_cents/100}€) ≠ TTC (${p.amount_ttc_cents/100}€)`,
      );
    }
  }

  if (p.vat_rate != null) {
    const isStandard = VALID_VAT_RATES.some((r) => Math.abs(r - p.vat_rate!) < 0.001);
    if (!isStandard) {
      warnings.push(`Taux de TVA non standard FR : ${(p.vat_rate * 100).toFixed(1)} %`);
    }
  }

  if (p.issued_at && p.due_at && p.due_at < p.issued_at) {
    warnings.push("La date d'échéance est antérieure à la date d'émission");
  }

  if (p.issued_at) {
    const d = new Date(p.issued_at);
    const cutoff = new Date("2015-01-01");
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    if (d < cutoff || d > future) {
      warnings.push(`Date d'émission hors fenêtre raisonnable : ${p.issued_at}`);
    }
  }

  return warnings;
}

// ---------- Utilities ----------

function normalizeWhitespace(s: string): string {
  // Collapse all whitespace runs into single spaces but keep €, %, /, : as is
  return s.replace(/[\s  ]+/g, " ").trim();
}

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toCents(raw: string): number | null {
  // "1 234,56" or "1.234,56" or "1234.56" → 123456 cents
  const cleaned = raw
    .replace(/[€\s  "']/g, "")
    .replace(/\.(\d{3})/g, "$1")
    .replace(",", ".");
  const v = parseFloat(cleaned);
  if (!isFinite(v)) return null;
  return Math.round(v * 100);
}

function parseRate(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, "").replace(",", ".");
  const v = parseFloat(cleaned);
  if (!isFinite(v) || v < 0) return null;
  return v > 1 ? v / 100 : v;
}

function parseFrenchDateToIso(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}
