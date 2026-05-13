/**
 * Types stricts pour les réponses brutes de l'API Pappers v2.
 *
 * Source : https://www.pappers.fr/api/documentation/v2 (extrait des champs
 * utiles à Bomatech V1.9). Les champs additionnels présents dans la réponse
 * mais non typés ici sont ignorés au mapping (cf `mapPappersToSnapshot`).
 *
 * NOTE : ce schéma sera affiné après les 1ers appels réels en P6. La v3
 * (à vérifier au moment où le compte sera ouvert) peut différer ; le mapper
 * absorbe la divergence pour isoler le reste du code des changements.
 */

export interface PappersAddress {
  siret?: string;
  adresse_ligne_1?: string | null;
  adresse_ligne_2?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
}

export interface PappersDirigeantRaw {
  nom: string;
  prenom?: string | null;
  qualite?: string | null;
  date_prise_de_poste?: string | null; // YYYY-MM-DD ou null
  age?: number | null;
}

/**
 * Types de procédure observés dans Pappers v2. Le mapper accepte aussi des
 * variantes texte libres via fallback `string` et les normalise vers
 * ProcedureCollectiveKind du domaine.
 */
export type PappersProcedureType =
  | "sauvegarde"
  | "redressement judiciaire"
  | "liquidation judiciaire"
  | "conciliation"
  | string;

export interface PappersProcedureCollectiveRaw {
  type: PappersProcedureType;
  date_jugement?: string | null; // YYYY-MM-DD
  date_cloture?: string | null; // null = procédure encore ouverte
  nature_procedure?: string | null;
  tribunal?: string | null;
}

export interface PappersComptesSociauxRaw {
  annee_cloture_exercice?: number;
  date_cloture_exercice?: string | null;
  date_depot?: string | null;
}

/** Réponse brute de GET /v2/entreprise?siren=XXXXXXXXX */
export interface PappersEntrepriseRaw {
  siren: string;
  siren_formate?: string;
  nom_entreprise: string;
  denomination?: string | null;
  forme_juridique?: string | null;
  code_naf?: string | null;
  libelle_code_naf?: string | null;
  date_creation?: string | null;
  date_immatriculation_rcs?: string | null;
  statut_rcs?: string | null;
  entreprise_cessee?: boolean;
  date_cessation?: string | null;
  capital?: number | null; // en euros (à confirmer en P6)
  devise_capital?: string | null;
  siege?: PappersAddress;
  representants?: PappersDirigeantRaw[];
  dirigeants?: PappersDirigeantRaw[];
  procedures_collectives?: PappersProcedureCollectiveRaw[];
  comptes_sociaux?: PappersComptesSociauxRaw[];
}

export interface PappersRechercheResultRaw {
  siren: string;
  nom_entreprise: string;
  denomination?: string | null;
  forme_juridique?: string | null;
  code_naf?: string | null;
  siege?: PappersAddress;
  date_creation?: string | null;
}

/** Réponse brute de GET /v2/recherche?q=XXX */
export interface PappersRechercheResponseRaw {
  resultats: PappersRechercheResultRaw[];
  total: number;
  page?: number;
  par_page?: number;
}

/**
 * Réponse brute de GET /v2/suivi-jetons.
 * Structure exacte à confirmer empiriquement au compte ouvert — hypothèses
 * basées sur la convention Pappers (champs en français).
 */
export interface PappersJetonsResponseRaw {
  jetons_restants?: number;
  jetons_consommes?: number;
  periode?: string;
}
