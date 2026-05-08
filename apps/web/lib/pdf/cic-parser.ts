/**
 * Parser PDF CIC.
 *
 * Format typique : extrait au format PDF avec texte sélectionnable (pas un scan).
 *  - Tableau 5 colonnes : Date | Date valeur | Opération | Débit EUROS | Crédit EUROS
 *  - Transactions multi-lignes : ligne 1 = dates + libellé + montant ;
 *    lignes suivantes (continuations) = détails sans date en début.
 *  - Le débit ou le crédit est déterminé par la position X de l'item montant
 *    (la frontière entre les deux colonnes est calculée à partir du header).
 *
 * Stratégie : on récupère les items texte avec coordonnées via unpdf
 * (wrapper pdfjs-dist), on les regroupe en lignes par bande Y, on détecte
 * le header pour calibrer la frontière débit/crédit, puis on agrège les
 * lignes en transactions.
 */

import { getDocumentProxy } from "unpdf";
import type { ParsedRow, ParseResult } from "../csv/cic-parser";
import { parseFrenchAmount, parseFrenchDate } from "../csv/cic-parser";

interface PdfItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

const AMOUNT_RE = /^-?\d{1,3}(?:[. \s]\d{3})*,\d{2}$/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

// Continuations that are page-level chrome (footer/header/disclaimer), not transaction detail.
const NOISE_RE =
  /^(solde\b|total\b|sous r[ée]serve|page \d+|r[ée]f\s*:|qxban\b|iban\b|information sur|\(g[ed]\)|gh\.\d|attention,|alerte\s*:|vous disposez|date valeur\b|date\s+date valeur|c\/c contrat|releve et informations|votre conseiller|cic\b|bomatech\b|banque cic|adresse postale|m[ée]diateur du cic|pour les op[ée]rations|pour toute demande|www\.|<<\s*suite)/i;

const DATE_COL_MAX_X = 95; // dates start before this X (date opération is around 52)
const LABEL_MIN_X = 140; // labels start around 148
const AMOUNT_MIN_X = 380; // amount items appear well past the label area

const Y_TOLERANCE = 2; // pts

export async function parseCicPdf(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch (e) {
    return {
      rows: [],
      errors: [{ line: 0, message: `Lecture PDF impossible : ${e instanceof Error ? e.message : String(e)}` }],
      detectedFormat: "unknown",
    };
  }

  const allRows: ParsedRow[] = [];
  const errors: { line: number; message: string }[] = [];
  let columnFrontier: number | null = null;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const item of tc.items as { str: string; transform?: number[]; width?: number }[]) {
      if (!item.str || !item.str.trim()) continue;
      const tr = item.transform ?? [1, 0, 0, 1, 0, 0];
      items.push({ text: item.str, x: tr[4], y: tr[5], width: item.width ?? 0 });
    }

    const lines = groupIntoLines(items);

    // Calibrate the débit/crédit frontier from the table header on this page (or first page seen)
    if (columnFrontier === null) {
      for (const line of lines) {
        const debitItem = line.find((it) => /^d[ée]bit\b/i.test(it.text));
        const creditItem = line.find((it) => /^cr[ée]dit\b/i.test(it.text));
        if (debitItem && creditItem) {
          // Frontier = midpoint between end of débit text and start of crédit text
          columnFrontier = (debitItem.x + debitItem.width + creditItem.x) / 2;
          break;
        }
      }
    }

    // Process lines into transactions
    let currentTx: { date: string; label: string[]; amountCents: number; raw: PdfItem[] } | null = null;

    for (const line of lines) {
      const dateItem = line.find((it) => it.x < DATE_COL_MAX_X && DATE_RE.test(it.text));
      const labelItems = line.filter((it) => it.x >= LABEL_MIN_X && it.x < AMOUNT_MIN_X);
      const amountItems = line.filter((it) => it.x >= AMOUNT_MIN_X && AMOUNT_RE.test(it.text));

      if (dateItem) {
        // Flush previous transaction
        if (currentTx) {
          allRows.push(toRow(currentTx));
          currentTx = null;
        }

        const labelText = labelItems
          .sort((a, b) => a.x - b.x)
          .map((it) => it.text.trim())
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        // Skip non-transaction rows (opening balance, etc.)
        if (!labelText || /^solde\b/i.test(labelText) || /^total\b/i.test(labelText)) {
          continue;
        }

        if (amountItems.length === 0) {
          // No amount on this dated line — skip rather than emit a half-row
          continue;
        }

        // Take rightmost amount in case there are multiple (e.g., USD line)
        const amountItem = amountItems.sort((a, b) => b.x - a.x)[0];
        const isoDate = parseFrenchDate(dateItem.text);
        if (!isoDate) {
          errors.push({ line: allRows.length + 1, message: `Date invalide : ${dateItem.text}` });
          continue;
        }

        const frontier = columnFrontier ?? (AMOUNT_MIN_X + 90); // fallback ≈ 470
        const isCredit = amountItem.x >= frontier;
        let absCents: number;
        try {
          absCents = Math.abs(parseFrenchAmount(amountItem.text));
        } catch (e) {
          errors.push({ line: allRows.length + 1, message: e instanceof Error ? e.message : String(e) });
          continue;
        }
        const signed = isCredit ? absCents : -absCents;

        currentTx = { date: isoDate, label: [labelText], amountCents: signed, raw: line };
      } else if (currentTx && labelItems.length > 0) {
        // Continuation line — append to current transaction's label, unless it's
        // page chrome (footer / repeated header / disclaimers).
        const continuation = labelItems
          .sort((a, b) => a.x - b.x)
          .map((it) => it.text.trim())
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!continuation || NOISE_RE.test(continuation)) {
          // End of the transaction block on this page; do not pollute the label.
          allRows.push(toRow(currentTx));
          currentTx = null;
          continue;
        }
        currentTx.label.push(continuation);
      }
    }

    // Flush last transaction at end of page
    if (currentTx) {
      allRows.push(toRow(currentTx));
      currentTx = null;
    }
  }

  if (allRows.length === 0 && errors.length === 0) {
    errors.push({
      line: 0,
      message: "Aucune transaction reconnue dans ce PDF. Vérifie qu'il s'agit bien d'un extrait CIC au format texte (pas un scan).",
    });
  }

  return { rows: allRows, errors, detectedFormat: "single-amount" };
}

function groupIntoLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= Y_TOLERANCE) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function toRow(tx: { date: string; label: string[]; amountCents: number; raw: PdfItem[] }): ParsedRow {
  const fullLabel = tx.label.join(" — ").replace(/\s+/g, " ").trim();
  return {
    date: tx.date,
    amount_cents: tx.amountCents,
    label: fullLabel,
    raw: { source: "pdf-cic", lines: String(tx.label.length) },
  };
}
