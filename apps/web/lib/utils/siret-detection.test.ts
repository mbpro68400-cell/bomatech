import { describe, expect, it } from "vitest";
import { detectInputKind, luhnCheck } from "./siret-detection";

describe("luhnCheck", () => {
  it("accepte des SIREN/SIRET réels conformes à la norme INSEE", () => {
    // Bouygues SA, SIREN public 572 015 246 (Luhn valide par construction Sirene).
    expect(luhnCheck("572015246")).toBe(true);
  });

  it("rejette une chaîne contenant un caractère non numérique", () => {
    expect(luhnCheck("57201524a")).toBe(false);
  });
});

describe("detectInputKind", () => {
  // 6 cas spécifiés au brief P5b.

  it("1. 14 chiffres valides Luhn → kind=siret + SIREN extrait", () => {
    // SIRET fictif construit pour passer Luhn (SIREN 572015246 + NIC 00018).
    const r = detectInputKind("57201524600018");
    expect(r).toEqual({ kind: "siret", siren: "572015246" });
  });

  it("2. 14 chiffres avec Luhn invalide → invalid (reason luhn)", () => {
    const r = detectInputKind("57201524600019");
    expect(r).toEqual({ kind: "invalid", reason: "luhn" });
  });

  it("3. 9 chiffres valides Luhn → kind=siren (séparateurs espaces tolérés)", () => {
    const r = detectInputKind("572 015 246");
    expect(r).toEqual({ kind: "siren", siren: "572015246" });
  });

  it("4. 9 chiffres avec Luhn invalide → invalid (reason luhn)", () => {
    const r = detectInputKind("572015247");
    expect(r).toEqual({ kind: "invalid", reason: "luhn" });
  });

  it("5. Nom < 3 caractères → invalid (reason too_short)", () => {
    const r = detectInputKind("AB");
    expect(r).toEqual({ kind: "invalid", reason: "too_short" });
  });

  it("6. Nom ≥ 3 caractères → kind=name (espaces préservés)", () => {
    const r = detectInputKind("Acme SARL");
    expect(r).toEqual({ kind: "name", query: "Acme SARL" });
  });
});
