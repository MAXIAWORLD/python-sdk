/** Validation helpers for French company identifiers, bank details and passwords. */

export const onlyDigits = (value: string) => value.replace(/\D/g, "");
export const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** Luhn checksum (SIREN, SIRET). */
export function luhn(num: string) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function isValidSiren(value: string) {
  const d = compact(value);
  return /^\d{9}$/.test(d) && luhn(d);
}

export function isValidSiret(value: string) {
  const d = compact(value);
  if (!/^\d{14}$/.test(d)) return false;
  // La Poste: establishments share SIREN 356 000 000, checksum = sum of digits multiple of 5.
  if (d.startsWith("356000000")) return [...d].reduce((s, c) => s + Number(c), 0) % 5 === 0;
  return luhn(d);
}

/** French intra-community VAT number computed from a SIREN: FR + key + SIREN. */
export function vatFromSiren(siren: string) {
  const d = compact(siren);
  const key = (12 + 3 * (Number(d) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${d}`;
}

/** Returns an error message, a warning message, or null when the VAT number looks right. */
export function checkVat(value: string, siren?: string): { level: "error" | "warning"; message: string } | null {
  const v = compact(value);
  if (!v) return null;
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(v)) return { level: "error", message: "Format attendu : code pays + numéro (ex. FR12 123456789)." };
  if (!v.startsWith("FR")) return null;
  const m = v.match(/^FR([0-9A-Z]{2})(\d{9})$/);
  if (!m) return { level: "error", message: "Un numéro de TVA français compte 13 caractères : FR + clé (2) + SIREN (9)." };
  if (siren && isValidSiren(siren) && m[2] !== compact(siren)) return { level: "warning", message: "Le SIREN contenu dans ce numéro ne correspond pas à votre SIREN." };
  if (/^\d{2}$/.test(m[1]) && vatFromSiren(m[2]) !== v) return { level: "warning", message: `Clé de contrôle inattendue : le numéro calculé est ${vatFromSiren(m[2])}.` };
  return null;
}

export function isValidIban(value: string) {
  const s = compact(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (s.startsWith("FR") && s.length !== 27) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const n = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of n) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

export const formatIban = (value: string) =>
  compact(value)
    .replace(/(.{4})/g, "$1 ")
    .trim();

export const isValidBic = (value: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact(value));

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export function isUrl(value: string) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Absolute http(s) URL, local hosts allowed (API endpoints, webhooks). */
export function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

export const isApe = (value: string) => /^\d{2}\.?\d{2}[A-Za-z]$/.test(value.trim());

export const formatSiren = (value: string) => onlyDigits(value).replace(/(\d{3})(?=\d)/g, "$1 ");

/* -------------------------------------------------------------------------- */
/* Passwords (CNIL recommendations: 12 characters, 3 character types)         */
/* -------------------------------------------------------------------------- */

export function passwordChecks(p: string) {
  return {
    length: p.length >= 12,
    lower: /\p{Ll}/u.test(p),
    upper: /\p{Lu}/u.test(p),
    digit: /\d/.test(p),
    symbol: /[^\p{L}\p{N}]/u.test(p),
  };
}

export function passwordClasses(p: string) {
  const c = passwordChecks(p);
  return [c.lower, c.upper, c.digit, c.symbol].filter(Boolean).length;
}

export const passwordValid = (p: string) => p.length >= 12 && passwordClasses(p) >= 3;

/** 0 (empty) to 4 (excellent). */
export function passwordScore(p: string) {
  if (!p) return 0;
  const classes = passwordClasses(p);
  let score = 1;
  if (p.length >= 12 && classes >= 3) score = 3;
  else if (p.length >= 10 && classes >= 2) score = 2;
  if (score === 3 && p.length >= 16 && classes === 4) score = 4;
  return score;
}

const PASSWORD_SETS = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?-_+="];

/** Strong random password with every character class (no ambiguous characters). */
export function generatePassword(length = 18) {
  const all = PASSWORD_SETS.join("");
  const random = (max: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  };
  const chars = PASSWORD_SETS.map((set) => set[random(set.length)]);
  while (chars.length < length) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
