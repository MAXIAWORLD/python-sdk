import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { EmailMessage, Ref } from "@/lib/types";

/** Email row as returned by the API (with every expanded foreign key). */
export type Mail = EmailMessage & { deal?: Ref | null; ticket?: Ref | null; in_reply_to?: string | null };

interface MailSettings {
  email?: { smtp_host?: string; smtp_user?: string; from_email?: string; imap_enabled?: boolean; imap_host?: string };
}

/**
 * What we know about the mail configuration. The email section of /settings is only returned to
 * administrators: for other roles both flags are `null` (unknown) and errors are handled on send/sync.
 */
export function useMailSettings() {
  const { data } = useApi<MailSettings>(["settings", "mail-status"], "/settings", undefined, { staleTime: 5 * 60_000 });
  const email = data?.email;
  return {
    smtpReady: email ? !!(email.smtp_host && (email.from_email || email.smtp_user)) : null,
    imapReady: email ? !!(email.imap_enabled && email.imap_host) : null,
  };
}

export const SETTINGS_EMAIL = "/settings?tab=email";

function withPrefix(prefix: string, subject?: string | null) {
  const base = (subject || "(sans objet)").replace(/^\s*((re|tr|fwd?|réf)\s*:\s*)+/i, "");
  return `${prefix} ${base}`;
}

export const replySubject = (subject?: string | null) => withPrefix("Re :", subject);
export const forwardSubject = (subject?: string | null) => withPrefix("Tr :", subject);

export function senderLabel(m: Pick<EmailMessage, "from_name" | "from_email">) {
  return m.from_name?.trim() || m.from_email || "Expéditeur inconnu";
}

/** Name shown in the list: the sender for received mail, the recipients for sent mail. */
export function counterpart(m: Mail) {
  if (m.direction === "in") return senderLabel(m);
  if (m.contact?.name) return m.contact.name;
  return m.to.join(", ") || "Sans destinataire";
}

function plainBody(m: Mail) {
  return (m.body_text ?? "").trim();
}

/** « Le 12 oct. 2026 à 10:42, Chloé <chloe@…> a écrit : » followed by the quoted message. */
export function quoteFor(m: Mail) {
  const who = m.from_email ? `${senderLabel(m)} <${m.from_email}>` : senderLabel(m);
  const quoted = plainBody(m)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\n\nLe ${dateTime(m.sent_at ?? m.created_at)}, ${who} a écrit :\n${quoted}`;
}

export function forwardBody(m: Mail) {
  const lines = [
    "",
    "",
    "---------- Message transféré ----------",
    `De : ${m.from_email ? `${senderLabel(m)} <${m.from_email}>` : senderLabel(m)}`,
    `Date : ${dateTime(m.sent_at ?? m.created_at)}`,
    `Objet : ${m.subject || "(sans objet)"}`,
    `À : ${m.to.join(", ")}`,
    ...(m.cc.length ? [`Cc : ${m.cc.join(", ")}`] : []),
    "",
    plainBody(m),
  ];
  return lines.join("\n");
}

/** Plain text → markdown that keeps single line breaks (emails are not written in markdown). */
export function textToMarkdown(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

/**
 * HTML document for a sandboxed <iframe srcDoc>: no script can run (sandbox=""), and a CSP blocks
 * remote content (tracking pixels) unless the reader explicitly allows images.
 */
/** Fixed-width email tables (width="600") become fluid so they fit the reading pane. */
function fluidTables(html: string) {
  return html.replace(/<table\b[^>]*>/gi, (tag) => {
    const width = tag.match(/\swidth=["']?(\d{3,4})["']?/i);
    if (!width) return tag;
    const fluid = `width:100%!important;max-width:${width[1]}px!important;`;
    const rest = tag.replace(width[0], "");
    return /\sstyle=["']/i.test(rest) ? rest.replace(/\sstyle=(["'])/i, (_m, quote: string) => ` style=${quote}${fluid}`) : rest.replace(/^<table/i, `<table style="${fluid}"`);
  });
}

export function emailSrcDoc(source: string, allowImages: boolean) {
  const html = fluidTables(source);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${allowImages ? " https: http:" : ""}`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:0}body{padding:12px 14px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;color:#111427;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}a{color:#4f5bd5}blockquote{margin:0 0 0 .4em;padding-left:.9em;border-left:3px solid #d9dcef;color:#555a78}</style>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

/** Whether the HTML references remote images (to offer « Afficher les images »). */
export function hasRemoteImages(html: string) {
  return /<img[^>]+src=["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
}
