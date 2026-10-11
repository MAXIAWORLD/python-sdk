import { CircleCheck, Eraser, FileDown, Fingerprint, PenLine, ShieldCheck, Type, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { date, money } from "@/lib/format";
import { toastError } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { rateLabel } from "./doc-utils";
import { CopyButton } from "./PublicBits";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import type { AcceptResult, PublicQuoteDoc } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SCRIPT_FONT = `"Segoe Script", "Snell Roundhand", "Apple Chancery", "Lucida Handwriting", "Brush Script MT", "URW Chancery L", cursive`;

export interface SignedProof extends AcceptResult {
  name: string;
  email: string;
  signature: string | null;
}

/** Typed signature rendered as a transparent PNG (same ink as drawn signatures). */
function typedSignature(name: string) {
  const size = 64;
  const font = `italic 400 ${size}px ${SCRIPT_FONT}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  canvas.width = Math.min(Math.ceil(ctx.measureText(name).width) + 48, 1400);
  canvas.height = Math.round(size * 1.7);
  ctx.font = font;
  ctx.fillStyle = "#0b1020";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 24, canvas.height / 2, canvas.width - 48);
  return canvas.toDataURL("image/png");
}

function ErrorText({ children }: { children?: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1.5 text-[12px] text-red-500">
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Signature form                                                             */
/* -------------------------------------------------------------------------- */

export function QuoteSignForm({ quote, token, onSigned, onDecline, onConflict }: { quote: PublicQuoteDoc; token: string; onSigned: (proof: SignedProof) => void; onDecline: () => void; onConflict: () => void }) {
  const [name, setName] = useState(quote.buyer.contact_name ?? "");
  const [email, setEmail] = useState(quote.buyer.email ?? "");
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [hasInk, setHasInk] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);

  const errors = {
    name: name.trim().length < 3 ? "Indiquez vos prénom et nom (3 caractères minimum)." : null,
    email: EMAIL_RE.test(email.trim()) ? null : "Indiquez une adresse email valide.",
    signature: mode === "draw" && !hasInk ? "Tracez votre signature dans le cadre, ou choisissez « Saisir »." : null,
    agree: agree ? null : "Cochez « Bon pour accord » pour valider votre signature.",
  };
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);

  const submit = async () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const signer = name.trim();
    const signature = mode === "draw" ? (pad.current?.toDataURL() ?? null) : typedSignature(signer);
    setSending(true);
    try {
      const res = await api.post<AcceptResult>(`/public/quotes/${encodeURIComponent(token)}/accept`, { name: signer, email: email.trim(), signature, agree: true });
      onSigned({ ...res, name: signer, email: email.trim().toLowerCase(), signature });
    } catch (e) {
      toastError(e);
      if (e instanceof ApiError && e.status === 409) onConflict();
    } finally {
      setSending(false);
    }
  };

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  return (
    <Glass radius="xl" glow className="no-print p-5 sm:p-7">
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_10px_24px_-10px_var(--accent)]">
          <PenLine className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Bon pour accord</h2>
          <p className="mt-0.5 text-[13.5px] text-fg-2">
            Signez le devis {quote.number} en ligne — {money(quote.total, quote.currency)} TTC. Cela prend moins d'une minute.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Prénom et nom du signataire" required error={show("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} autoComplete="name" placeholder="Ex. : Léa Dupont" aria-invalid={!!show("name")} />
        </Field>
        <Field label="Email" required error={show("email")}>
          <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} autoComplete="email" placeholder="vous@entreprise.fr" aria-invalid={!!show("email")} />
        </Field>

        <div className="sm:col-span-2" role="group" aria-label="Signature">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-fg-2">
              Signature<span className="ml-0.5 text-[var(--accent)]">*</span>
            </span>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "draw", label: "Dessiner", icon: <PenLine className="size-3.5" /> },
                { value: "type", label: "Saisir", icon: <Type className="size-3.5" /> },
              ]}
            />
          </div>
          <div className={cn("glass-inset relative h-[190px] overflow-hidden rounded-[18px] transition-shadow sm:h-[210px]", show("signature") && "ring-2 ring-red-500/50")}>
            {/* The pad stays mounted while typing so a drawn signature survives a round trip. */}
            <div className={cn("absolute inset-0", mode !== "draw" && "hidden")}>
              <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-12 flex items-end gap-2 sm:inset-x-10">
                <span className="text-[18px] leading-none text-fg-3">×</span>
                <span className="mb-1 flex-1 border-b border-dashed border-[var(--hairline-strong)]" />
              </div>
              <AnimatePresence>
                {!hasInk && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 pb-8 text-center text-[13px] text-fg-3">
                    <PenLine className="size-5" />
                    Signez ici avec la souris, le doigt ou un stylet
                  </motion.div>
                )}
              </AnimatePresence>
              <SignaturePad ref={pad} onChange={setHasInk} disabled={sending} label="Zone de signature manuscrite" />
              {hasInk && (
                <div className="absolute right-2 top-2 flex gap-1">
                  <Button type="button" size="xs" variant="glass" icon={<Undo2 className="size-3.5" />} onClick={() => pad.current?.undo()}>
                    Annuler
                  </Button>
                  <Button type="button" size="xs" variant="glass" icon={<Eraser className="size-3.5" />} onClick={() => pad.current?.clear()}>
                    Effacer
                  </Button>
                </div>
              )}
            </div>
            {mode === "type" && (
              <div className="flex h-full flex-col items-center justify-center px-6 pb-4">
                <span className={cn("max-w-full truncate px-2 text-[38px] italic leading-[1.5] sm:text-[46px]", name.trim() ? "text-fg" : "text-fg-3")} style={{ fontFamily: SCRIPT_FONT }}>
                  {name.trim() || "Votre nom"}
                </span>
                <span className="mt-1 h-px w-3/4 border-b border-dashed border-[var(--hairline-strong)]" />
              </div>
            )}
          </div>
          {show("signature") ? <ErrorText>{show("signature")}</ErrorText> : <p className="mt-1.5 text-[12px] text-fg-3">{mode === "draw" ? "Tracez votre signature à l'intérieur du cadre." : "Votre nom, saisi ci-dessus, est apposé comme signature."}</p>}
        </div>

        <div className="sm:col-span-2">
          <div
            className={cn(
              "rounded-[16px] px-3.5 py-3 ring-1 ring-inset transition-colors",
              agree ? "bg-emerald-500/[0.07] ring-emerald-500/25" : show("agree") ? "bg-red-500/[0.05] ring-red-500/30" : "bg-black/[0.025] ring-[var(--hairline)] dark:bg-white/[0.035]",
            )}
          >
            <Checkbox
              checked={agree}
              onChange={setAgree}
              className="items-start"
              label={
                <span className="leading-snug">
                  <b className="font-semibold">Bon pour accord :</b> j'accepte le devis et les conditions générales.
                  <span className="mt-0.5 block text-[12px] text-fg-3">
                    Devis {quote.number} du {date(quote.issue_date)}, d'un montant de {money(quote.total, quote.currency)} TTC
                    {quote.deposit_percent ? `, avec un acompte de ${rateLabel(quote.deposit_percent)} à la commande` : ""}.
                  </span>
                </span>
              }
            />
          </div>
          <ErrorText>{show("agree")}</ErrorText>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onDecline} className="self-center text-[13px] font-medium text-fg-3 underline-offset-4 transition hover:text-red-500 hover:underline sm:self-auto">
          Je ne souhaite pas donner suite
        </button>
        <Button type="button" variant="primary" size="lg" loading={sending} icon={<PenLine className="size-4" />} onClick={submit} className="w-full sm:w-auto">
          Signer le devis
        </Button>
      </div>

      <p className="mt-5 flex gap-2.5 border-t border-[var(--hairline)] pt-4 text-[11.5px] leading-relaxed text-fg-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        <span>
          Signature électronique simple au sens du règlement (UE) n° 910/2014 « eIDAS ». Sont conservés comme preuve : vos nom et email, la date et l'heure (horodatage), votre adresse IP, votre navigateur et une empreinte SHA-256 du devis et de votre
          signature.
        </span>
      </p>
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Proof of signature                                                         */
/* -------------------------------------------------------------------------- */

function ProofRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12.5px] text-fg-3">{label}</dt>
      <dd className="min-w-0 text-[13.5px]">{children}</dd>
    </div>
  );
}

export function SignatureProof({ quote, fresh, company, pdfHref, pdfName }: { quote: PublicQuoteDoc; fresh: boolean; company: string; pdfHref: string; pdfName: string }) {
  const at = quote.accepted_at;
  return (
    <Glass radius="xl" glow className="overflow-hidden">
      <div className="flex items-start gap-4 bg-emerald-500/[0.09] px-5 py-5 sm:px-7">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_12px_28px_-10px_rgba(16,185,129,.8)]"
        >
          <CircleCheck className="size-6" />
        </motion.span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{fresh ? "Merci, votre accord est enregistré" : "Devis signé électroniquement"}</h2>
          <p className="mt-0.5 text-[13.5px] text-fg-2">
            {fresh
              ? `L'équipe de ${company} est notifiée de votre signature et reviendra vers vous très vite. Conservez le PDF signé pour vos archives.`
              : `Ce devis a été accepté en ligne${quote.signed_by ? ` par ${quote.signed_by}` : ""}. Voici la preuve de signature conservée.`}
          </p>
        </div>
      </div>
      <div className="grid gap-6 px-5 py-4 sm:px-7 md:grid-cols-[minmax(0,1fr)_220px]">
        <dl className="divide-y divide-[var(--hairline)]">
          <ProofRow label="Signataire">
            <span className="block font-medium">{quote.signed_by ?? "—"}</span>
            {quote.signer_email && <span className="block break-all text-[12.5px] text-fg-3">{quote.signer_email}</span>}
          </ProofRow>
          <ProofRow label="Date et heure">
            <span className="tabular">{at ? date(at, "EEEE d MMMM yyyy 'à' HH:mm:ss") : "—"}</span>
            {at && <span className="block font-mono text-[11.5px] text-fg-3">Horodatage UTC : {new Date(at).toISOString().replace(".000", "")}</span>}
          </ProofRow>
          <ProofRow label="Document">
            Devis {quote.number} · {money(quote.total, quote.currency)} TTC
          </ProofRow>
          <ProofRow label="Empreinte SHA-256">
            {quote.signature_hash ? (
              <span className="flex items-start gap-1.5">
                <Fingerprint className="mt-0.5 size-4 shrink-0 text-fg-3" />
                <span className="min-w-0 break-all font-mono text-[12px] leading-relaxed text-fg-2">{quote.signature_hash}</span>
                <CopyButton value={quote.signature_hash} label="l'empreinte" message="Empreinte copiée" className="-mt-1" />
              </span>
            ) : (
              "—"
            )}
          </ProofRow>
        </dl>
        <div className="flex flex-col">
          <div className="text-[12.5px] text-fg-3">Signature</div>
          <div className="glass-inset mt-1.5 flex min-h-[110px] flex-1 items-center justify-center rounded-[16px] p-3">
            {quote.signature ? (
              <img src={quote.signature} alt={`Signature de ${quote.signed_by ?? "signataire"}`} className="max-h-[96px] max-w-full object-contain dark:invert" />
            ) : (
              <span className="text-center text-[12.5px] text-fg-3">Accord donné par case à cocher, sans tracé manuscrit.</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-[var(--hairline)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="flex items-center gap-2 text-[11.5px] text-fg-3">
          <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
          Signature électronique simple (eIDAS) · horodatée et scellée par empreinte.
        </p>
        <Button variant="glass" size="sm" asChild>
          <a href={pdfHref} download={pdfName}>
            <FileDown className="size-4" /> Devis signé (PDF)
          </a>
        </Button>
      </div>
    </Glass>
  );
}

/* -------------------------------------------------------------------------- */
/* Decline                                                                    */
/* -------------------------------------------------------------------------- */

export function DeclineDialog({ open, onOpenChange, token, number, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; number: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    setSending(true);
    try {
      await api.post(`/public/quotes/${encodeURIComponent(token)}/decline`, { reason: reason.trim() });
      toast.success("Votre réponse a bien été transmise", { description: "Merci de nous avoir tenus informés." });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Refuser le devis ${number} ?`}
      description="Votre retour nous aide à mieux vous accompagner. Le motif est facultatif."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Revenir au devis
          </Button>
          <Button variant="danger" loading={sending} onClick={submit}>
            Refuser le devis
          </Button>
        </>
      }
    >
      <Field label="Motif (facultatif)">
        <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : budget reporté, besoin modifié, autre prestataire retenu…" />
      </Field>
    </Dialog>
  );
}
