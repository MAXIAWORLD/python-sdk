import { BookOpen, Boxes, Database, KeyRound, Plug, Receipt, Rocket, ShieldCheck, UserCog, Wrench, type LucideIcon } from "lucide-react";
import { colorFor } from "@/lib/utils";

/** Accent-insensitive slug (same rules as the backend) for anchors. */
export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** « # Titre » on the first line of a generated article → { title, body without that line }. */
export function splitTitle(markdown: string) {
  const m = markdown.match(/^\s*#\s+(.+?)\s*\n/);
  if (!m) return { title: null as string | null, body: markdown };
  return { title: m[1].replace(/\*\*/g, "").trim(), body: markdown.slice(m[0].length).replace(/^\s*\n/, "") };
}

/** Remove a leading H1 that repeats the article title (the page already shows it). */
export function stripTitle(body: string, title: string) {
  const { title: h1, body: rest } = splitTitle(body);
  return h1 && h1.toLowerCase() === title.trim().toLowerCase() ? rest : body;
}

export function readingMinutes(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

/** H2/H3 of a markdown document (outside code blocks), for a table of contents. */
export function headings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = line.match(/^(##|###)\s+(.+?)\s*#*\s*$/);
    if (m) {
      const text = m[2].replace(/[*_`]/g, "");
      out.push({ level: m[1].length as 2 | 3, text, id: slugify(text) });
    }
  }
  return out;
}

const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/factur|paiement|devis|abonnement/i, Receipt],
  [/int[ée]gration|api|mcp|connect/i, Plug],
  [/compte|[ée]quipe|utilisateur|r[ôo]le/i, UserCog],
  [/donn[ée]es|import|export/i, Database],
  [/conformit|rgpd|s[ée]curit|l[ée]gal/i, ShieldCheck],
  [/technique|bug|d[ée]pannage|erreur/i, Wrench],
  [/web3|crypto|blockchain|wallet/i, Boxes],
  [/d[ée]marr|prise en main|premiers pas/i, Rocket],
  [/acc[eè]s|connexion|sso|mot de passe/i, KeyRound],
];

/** Icon and gradient used for a knowledge-base category everywhere (back-office and help center). */
export function categoryStyle(category?: string | null) {
  const icon = CATEGORY_ICONS.find(([re]) => category && re.test(category))?.[1] ?? BookOpen;
  const base = colorFor(category || "Général");
  return { icon, gradient: `linear-gradient(140deg, ${base}, color-mix(in oklab, ${base} 55%, #1e1b4b))` };
}

export const NO_CATEGORY = "Général";

/** Plain-text excerpt of a markdown body (cards, search results). */
export function excerpt(markdown: string, length = 160) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, "")}…` : text;
}

/** Lower-case, accent-free text for client-side search. */
export function fold(text?: string | null) {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export const KB_STATUS = [
  { value: "published", label: "Publié", tone: "green" as const },
  { value: "draft", label: "Brouillon", tone: "gray" as const },
];
