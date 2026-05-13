/**
 * Auto-détection SIRET / SIREN / nom + vérification Luhn pour les
 * identifiants français (V1.9 — Veille fournisseurs).
 *
 * Pure function — pas d'IO, pas de side-effect. Appelée à chaque keystroke
 * côté UI pour activer/désactiver le bouton « Rechercher » et afficher
 * une erreur inline AVANT tout appel Pappers (économie de crédit du
 * quota mensuel 100/mois).
 *
 * Algorithme de contrôle : Luhn (ISO/IEC 7812-1). La clé de contrôle
 * Luhn fait partie intégrante de la structure SIREN (9 chiffres) et
 * SIRET (14 chiffres) définie par l'INSEE dans le « Guide d'utilisation
 * du répertoire Sirene » (référentiel public Sirene). Un identifiant
 * qui ne valide pas Luhn ne peut pas exister légalement dans Sirene.
 *
 * Limites V1 :
 *  - La Poste a historiquement des SIRET qui ne valident pas Luhn
 *    standard (cas non géré ici, considéré comme invalid). Acceptable
 *    pour le marché TPE/PME visé : un fournisseur ne sera pas la Poste,
 *    et l'utilisateur peut alors basculer en recherche par nom.
 *  - Espaces, points, tirets retirés AVANT regex (formats imprimés
 *    courants « 572 015 246 », « 572.015.246 »). Pas appliqué aux noms
 *    pour préserver les espaces de dénomination (« Acme Industries SAS »).
 */

export type DetectionResult =
  | { kind: "siret"; siren: string } // SIRET valide → SIREN extrait (9 premiers chiffres)
  | { kind: "siren"; siren: string } // SIREN valide
  | { kind: "name"; query: string } // ≥ 3 caractères, recherche par dénomination
  | { kind: "invalid"; reason: "luhn" | "too_short" | "empty" };

function stripNumericSeparators(s: string): string {
  return s.replace(/[\s.\-]/g, "");
}

/**
 * Algorithme de Luhn standard sur une chaîne de N chiffres.
 * Doubler les chiffres en position impaire en partant de la droite,
 * soustraire 9 si > 9, sommer. La somme totale doit être divisible par 10.
 */
export function luhnCheck(digits: string): boolean {
  if (!/^[0-9]+$/.test(digits)) return false;
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    let n = digits.charCodeAt(len - 1 - i) - 48; // '0' = 48
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function detectInputKind(raw: string): DetectionResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: "invalid", reason: "empty" };
  }
  const numeric = stripNumericSeparators(trimmed);

  if (/^[0-9]{14}$/.test(numeric)) {
    if (!luhnCheck(numeric)) return { kind: "invalid", reason: "luhn" };
    // Par construction, si SIRET valide Luhn, le SIREN extrait valide aussi.
    // Revalidé pour défense en profondeur.
    const siren = numeric.slice(0, 9);
    if (!luhnCheck(siren)) return { kind: "invalid", reason: "luhn" };
    return { kind: "siret", siren };
  }

  if (/^[0-9]{9}$/.test(numeric)) {
    if (!luhnCheck(numeric)) return { kind: "invalid", reason: "luhn" };
    return { kind: "siren", siren: numeric };
  }

  // Recherche par nom : on garde le trimmed original (avec espaces).
  if (trimmed.length < 3) return { kind: "invalid", reason: "too_short" };
  return { kind: "name", query: trimmed };
}
