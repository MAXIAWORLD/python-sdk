import { NATURES, labelOf } from "@/lib/constants";
import { number } from "@/lib/format";
import type { SellerParty } from "./types";

export const natureLabel = (nature?: string | null) => labelOf(NATURES, nature ?? "services");

/** Rate in French notation: « 20 % », « 5,5 % » (VAT, discount, deposit). */
export function rateLabel(rate: number) {
  return `${number(rate, rate % 1 ? 1 : 0)} %`;
}

const INVARIANT_UNITS = new Set(["h", "g", "kg", "t", "l", "cl", "ml", "m", "km"]);

/** French plural of a billing unit after a quantity: « 8 jours », « 2 mois », « 3 m² ». */
export function quantityLabel(quantity = 1, unit = "unité") {
  const q = number(quantity, quantity % 1 ? 2 : 0);
  const invariant = /[sxz²³]$/.test(unit) || INVARIANT_UNITS.has(unit);
  return `${q} ${quantity >= 2 && !invariant ? `${unit}s` : unit}`;
}

const group = (value: string, size: number) => value.replace(new RegExp(`(.{${size}})(?=.)`, "g"), "$1 ");

export function formatSiren(siren?: string | null) {
  const v = (siren ?? "").replace(/\s+/g, "");
  if (v.length === 9) return group(v, 3);
  if (v.length === 14) return `${group(v.slice(0, 9), 3)} ${v.slice(9)}`;
  return v;
}

/** IBAN printed in blocks of four. */
export function formatIban(iban?: string | null) {
  return group((iban ?? "").replace(/\s+/g, "").toUpperCase(), 4);
}

/** Legal identity line of the issuer (same content as the PDF footer). */
export function legalIdentity(s: SellerParty) {
  const parts: string[] = [];
  if (s.name) parts.push(s.name);
  if (s.legal_form) parts.push(`${s.legal_form}${s.capital ? ` au capital de ${/€/.test(s.capital) ? s.capital : `${s.capital} €`}` : ""}`);
  const address = [s.address, [s.zip, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (address) parts.push(`Siège : ${address}`);
  if (s.siren) parts.push(s.rcs_city ? `RCS ${s.rcs_city} ${formatSiren(s.siren)}` : `SIREN ${formatSiren(s.siren)}`);
  if (s.rm) parts.push(`RM ${s.rm}`);
  if (s.vat_number) parts.push(`TVA intracom. ${s.vat_number}`);
  if (s.ape) parts.push(`APE ${s.ape}`);
  return parts.join(" — ");
}

export function websiteHref(url?: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `https://${url}`;
}
