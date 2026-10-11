/**
 * Identité légale d'une entreprise cliente : contrôles SIREN / SIRET / TVA et complétude
 * des mentions client requises sur une facture B2B (miroir des contrôles du backend
 * `services/invoicing.legal_checks`, enrichi de vérifications de format côté client).
 */
import type { Company } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Pays                                                                       */
/* -------------------------------------------------------------------------- */

export const EU_CODES = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]);

const COUNTRIES: Record<string, string> = {
  france: "FR", allemagne: "DE", germany: "DE", autriche: "AT", austria: "AT", belgique: "BE", belgium: "BE", bulgarie: "BG", bulgaria: "BG",
  chypre: "CY", cyprus: "CY", croatie: "HR", croatia: "HR", danemark: "DK", denmark: "DK", espagne: "ES", spain: "ES", estonie: "EE", estonia: "EE",
  finlande: "FI", finland: "FI", grece: "GR", greece: "GR", hongrie: "HU", hungary: "HU", irlande: "IE", ireland: "IE", italie: "IT", italy: "IT",
  lettonie: "LV", latvia: "LV", lituanie: "LT", lithuania: "LT", luxembourg: "LU", malte: "MT", malta: "MT", "pays-bas": "NL", netherlands: "NL",
  pologne: "PL", poland: "PL", portugal: "PT", roumanie: "RO", romania: "RO", slovaquie: "SK", slovakia: "SK", slovenie: "SI", slovenia: "SI",
  suede: "SE", sweden: "SE", tchequie: "CZ", "republique tcheque": "CZ", czechia: "CZ", "czech republic": "CZ",
  suisse: "CH", switzerland: "CH", "royaume-uni": "GB", "united kingdom": "GB", uk: "GB", "etats-unis": "US", "united states": "US", usa: "US",
  canada: "CA", maroc: "MA", morocco: "MA", tunisie: "TN", algerie: "DZ", senegal: "SN", "cote d'ivoire": "CI", singapour: "SG", singapore: "SG",
  "emirats arabes unis": "AE", dubai: "AE", norvege: "NO", norway: "NO", islande: "IS", monaco: "MC", japon: "JP", japan: "JP", chine: "CN", china: "CN",
  inde: "IN", india: "IN", bresil: "BR", brazil: "BR", australie: "AU", australia: "AU", israel: "IL", "hong kong": "HK",
};

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** ISO code of a country name ("France", "Luxembourg", "DE"…); empty means France, unknown names return null. */
export function countryCode(country?: string | null): string | null {
  if (!country || !country.trim()) return "FR";
  const value = country.trim();
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  return COUNTRIES[fold(value)] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Identifiants                                                               */
/* -------------------------------------------------------------------------- */

export function normalizeId(value?: string | null) {
  return (value ?? "").replace(/[\s.\-_/]/g, "").toUpperCase();
}

function luhn(digits: string) {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i]);
    if ((digits.length - 1 - i) % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    total += n;
  }
  return total % 10 === 0;
}

export function sirenIsValid(value?: string | null) {
  const v = normalizeId(value);
  return /^\d{9}$/.test(v) && luhn(v);
}

export function siretIsValid(value?: string | null) {
  const v = normalizeId(value);
  if (!/^\d{14}$/.test(v)) return false;
  // La Poste : les SIRET de ses établissements dérogent à la clé de Luhn (somme des chiffres multiple de 5).
  if (v.startsWith("356000000") && [...v].reduce((s, d) => s + Number(d), 0) % 5 === 0) return true;
  return luhn(v);
}

/** Clé du numéro de TVA intracommunautaire français : (12 + 3 × (SIREN mod 97)) mod 97. */
export function frVatFromSiren(siren: string) {
  const s = normalizeId(siren);
  const key = (12 + 3 * (Number(s) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${s}`;
}

function vatIssue(vat: string, siren: string, cc: string | null): string | null {
  if (cc === "FR" || vat.startsWith("FR")) {
    if (!/^FR[0-9A-Z]{2}\d{9}$/.test(vat)) return "Format attendu : FR + clé à 2 caractères + SIREN à 9 chiffres.";
    const sirenPart = vat.slice(4);
    if (sirenIsValid(siren) && sirenPart !== siren) return `Le numéro ne reprend pas le SIREN de l'entreprise (${siren}).`;
    const expected = frVatFromSiren(sirenPart);
    if (/^\d{2}$/.test(vat.slice(2, 4)) && vat !== expected) return `Clé de contrôle incorrecte : le numéro attendu est ${expected}.`;
    return null;
  }
  if (cc && EU_CODES.has(cc)) {
    const prefix = cc === "GR" ? "EL" : cc;
    if (!vat.startsWith(prefix)) return `Un numéro de TVA de ce pays commence par « ${prefix} ».`;
    if (!/^[A-Z]{2}[0-9A-Z+*]{2,12}$/.test(vat)) return "Format de numéro de TVA inhabituel : vérifiez-le sur le service VIES.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Complétude pour la facturation                                             */
/* -------------------------------------------------------------------------- */

export type Region = "fr" | "eu" | "non_eu" | "unknown";
export type CheckState = "ok" | "missing" | "invalid" | "optional";

export interface LegalCheck {
  id: "address" | "siren" | "siret" | "vat";
  label: string;
  state: CheckState;
  required: boolean;
  hint: string;
}

export interface LegalReport {
  region: Region;
  countryCode: string | null;
  checks: LegalCheck[];
  ready: boolean;
  requiredOk: number;
  requiredTotal: number;
  /** Numéro de TVA FR calculé depuis un SIREN valide, proposé quand il manque ou est faux. */
  vatSuggestion: string | null;
}

export function legalReport(company: Company): LegalReport {
  const cc = countryCode(company.country);
  const region: Region = cc === null ? "unknown" : cc === "FR" ? "fr" : EU_CODES.has(cc) ? "eu" : "non_eu";
  const siren = normalizeId(company.siren);
  const siret = normalizeId(company.siret);
  const vat = normalizeId(company.vat_number);
  const checks: LegalCheck[] = [];

  const addressOk = !!(company.address?.trim() && company.zip?.trim() && company.city?.trim());
  checks.push({
    id: "address",
    label: "Adresse de facturation",
    required: true,
    state: addressOk ? "ok" : "missing",
    hint: addressOk ? "Rue, code postal et ville renseignés." : "Rue, code postal et ville : mention obligatoire sur toute facture.",
  });

  if (region === "fr" || siren) {
    const state: CheckState = !siren ? "missing" : sirenIsValid(siren) ? "ok" : "invalid";
    checks.push({
      id: "siren",
      label: "SIREN",
      required: region === "fr",
      state,
      hint:
        state === "ok"
          ? "Valide (clé de contrôle vérifiée)."
          : state === "missing"
            ? "Obligatoire sur les factures B2B avec la réforme de la facturation électronique (2026-2027)."
            : /^\d{9}$/.test(siren)
              ? "Clé de contrôle incorrecte (algorithme de Luhn) : vérifiez les 9 chiffres."
              : "Le SIREN comporte exactement 9 chiffres.",
    });
  }

  if (company.is_public_entity || siret) {
    const valid = siretIsValid(siret);
    const mismatch = valid && sirenIsValid(siren) && !siret.startsWith(siren);
    const state: CheckState = !siret ? "missing" : !valid || mismatch ? "invalid" : "ok";
    checks.push({
      id: "siret",
      label: "SIRET",
      required: !!company.is_public_entity,
      state,
      hint:
        state === "ok"
          ? company.is_public_entity
            ? "Valide — requis pour le dépôt sur Chorus Pro."
            : "Valide (clé de contrôle vérifiée)."
          : state === "missing"
            ? "Obligatoire pour facturer une entité publique via Chorus Pro."
            : mismatch
              ? `Le SIRET ne commence pas par le SIREN de l'entreprise (${siren}).`
              : /^\d{14}$/.test(siret)
                ? "Clé de contrôle incorrecte : vérifiez les 14 chiffres."
                : "Le SIRET comporte exactement 14 chiffres.",
    });
  }

  const issue = vat ? vatIssue(vat, siren, cc) : null;
  if (region === "eu") {
    checks.push({
      id: "vat",
      label: "N° TVA intracommunautaire",
      required: true,
      state: !vat ? "missing" : issue ? "invalid" : "ok",
      hint: !vat ? "Obligatoire pour un client établi dans l'UE (autoliquidation de la TVA)." : (issue ?? "Renseigné — vérifiable sur le service VIES."),
    });
  } else if (region === "fr") {
    checks.push({
      id: "vat",
      label: "N° TVA intracommunautaire",
      required: false,
      state: !vat ? "optional" : issue ? "invalid" : "ok",
      hint: !vat ? "Facultatif pour un client français, mais recommandé." : (issue ?? "Cohérent avec le SIREN."),
    });
  } else if (vat) {
    checks.push({ id: "vat", label: "N° TVA / identifiant fiscal", required: false, state: "ok", hint: "Client hors UE : aucun numéro de TVA intracommunautaire n'est exigé." });
  }

  const required = checks.filter((c) => c.required);
  const requiredOk = required.filter((c) => c.state === "ok").length;
  const ready = requiredOk === required.length && !checks.some((c) => c.state === "invalid");
  const vatSuggestion = region === "fr" && sirenIsValid(siren) && (!vat || !!issue) ? frVatFromSiren(siren) : null;
  return { region, countryCode: cc, checks, ready, requiredOk, requiredTotal: required.length, vatSuggestion };
}
