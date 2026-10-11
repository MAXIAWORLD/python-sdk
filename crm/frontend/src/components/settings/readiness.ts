import type { CompanySettings } from "./types";
import { checkVat, isEmail, isValidIban, isValidSiren } from "./validators";

/** Legal forms for which the share capital and the RCS city must appear on invoices. */
export const COMMERCIAL_FORMS = new Set(["SAS", "SASU", "SARL", "EURL", "SA", "SNC", "SCA", "SCS", "SELARL", "SELAS", "SELAFA", "SCOP"]);

export interface ReadinessItem {
  label: string;
  ok: boolean;
  required: boolean;
  anchor: string;
}

/** Mandatory (blocking) and recommended invoice mentions, aligned with the backend legal checks. */
export function readiness(v: CompanySettings): ReadinessItem[] {
  const commercial = COMMERCIAL_FORMS.has((v.legal_form || "").toUpperCase());
  const franchise = v.vat_regime === "franchise";
  const vat = checkVat(v.vat_number || "", v.siren);
  return [
    { label: "Raison sociale", ok: !!(v.legal_name || v.name || "").trim(), required: true, anchor: "identity" },
    { label: "Adresse du siège", ok: !!(v.address && v.zip && v.city), required: true, anchor: "address" },
    { label: "SIREN valide", ok: isValidSiren(v.siren || ""), required: true, anchor: "fiscal" },
    { label: franchise ? "Franchise en base de TVA" : "TVA intracommunautaire", ok: franchise || (!!v.vat_number && vat?.level !== "error"), required: true, anchor: "fiscal" },
    ...(commercial
      ? [
          { label: "Capital social", ok: !!v.capital, required: false, anchor: "identity" },
          { label: "Ville d'immatriculation (RCS)", ok: !!v.rcs_city, required: false, anchor: "identity" },
        ]
      : []),
    { label: "IBAN pour les virements", ok: isValidIban(v.iban || ""), required: false, anchor: "bank" },
    { label: "Email de facturation", ok: isEmail(v.email || ""), required: false, anchor: "address" },
  ];
}

