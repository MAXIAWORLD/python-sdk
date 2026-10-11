import { BatteryFull, ChevronLeft, Monitor, Signal, Smartphone, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Segmented } from "@/components/ui/tabs";
import { useLocalStorage } from "@/lib/hooks";
import { cn, initials } from "@/lib/utils";
import { personalize, softBreaks, type SampleContact } from "./campaign-utils";

export interface EmailOrg {
  name: string;
  legal: string;
  accent: string;
  privacyUrl?: string | null;
}

export interface EmailContent {
  fromName: string;
  fromEmail: string;
  subject: string;
  preheader: string;
  body: string;
}

/** Email body rendered like the backend layout (`mailer.layout`): always light, like a real mail client. */
function EmailDocument({ content, sample, org, compact }: { content: EmailContent; sample: SampleContact; org: EmailOrg; compact?: boolean }) {
  const body = personalize(content.body, sample);
  return (
    <div className={cn("bg-[#f3f4f9]", compact ? "px-2.5 py-4" : "px-4 py-7 sm:px-8")}>
      <div className="mx-auto max-w-[600px] overflow-hidden rounded-[18px] bg-white shadow-[0_8px_30px_rgba(17,20,39,.06)]">
        <div className="h-[5px]" style={{ background: `linear-gradient(90deg, ${org.accent}, #8b5cf6, #22d3ee)` }} />
        <div className={cn("pb-1 font-bold", compact ? "px-5 pt-5 text-[16px]" : "px-8 pt-7 text-[18px]")} style={{ color: org.accent }}>
          {org.name}
        </div>
        <div
          className={cn(
            "break-words leading-[1.6] text-[#2a2e45]",
            compact ? "px-5 pb-6 pt-2 text-[14px]" : "px-8 pb-7 pt-2 text-[15px]",
            "[&_a]:font-semibold [&_a]:text-[var(--mail-accent)] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--mail-accent)] [&_blockquote]:pl-3 [&_blockquote]:text-[#5b6075] [&_h1]:my-3 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-semibold [&_hr]:my-5 [&_hr]:border-[#e6e8f0] [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-[10px] [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-[#111427] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
          )}
          style={{ ["--mail-accent" as string]: org.accent }}
        >
          {body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} onClick={(e) => e.preventDefault()}>{children}</a> }}>
              {softBreaks(body)}
            </ReactMarkdown>
          ) : (
            <p className="my-3 italic text-[#9a9fb3]">Le contenu de votre email apparaîtra ici…</p>
          )}
        </div>
      </div>
      <div className={cn("mx-auto max-w-[600px] text-[11px] leading-[1.5] text-[#8a8fa6]", compact ? "px-3 py-3" : "px-6 py-4")}>
        {org.legal}
        <p className="mt-2">
          Vous recevez cet email de la part de {org.name}. <span className="underline">Se désinscrire</span>
          {org.privacyUrl && (
            <>
              {" · "}
              <span className="underline">Politique de confidentialité</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function SenderAvatar({ name, accent, size = 36 }: { name: string; accent: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(140deg, ${accent}, color-mix(in oklab, ${accent} 55%, #000))` }}>
      {initials(name)}
    </span>
  );
}

function DesktopFrame({ content, sample, org }: { content: EmailContent; sample: SampleContact; org: EmailOrg }) {
  const subject = personalize(content.subject, sample) || "(sans objet)";
  const preheader = personalize(content.preheader, sample);
  return (
    <div className="overflow-hidden rounded-[18px] bg-white text-[#111427] shadow-[0_24px_60px_-28px_rgba(20,30,90,.45)] ring-1 ring-black/[0.07] dark:ring-white/10">
      <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[#f6f7fb] px-3.5 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto pr-10 text-[11.5px] font-medium text-[#6b7086]">Boîte de réception — {sample.email}</span>
      </div>
      <div className="flex items-start gap-3 border-b border-black/[0.06] bg-[#eef1ff] px-4 py-3">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#3b6cff]" />
        <SenderAvatar name={content.fromName} accent={org.accent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13.5px] font-bold">{content.fromName}</span>
            <span className="shrink-0 text-[11.5px] text-[#6b7086]">à l'instant</span>
          </div>
          <div className="truncate text-[13px]">
            <span className="font-semibold">{subject}</span>
            {preheader && <span className="text-[#6b7086]"> — {preheader}</span>}
          </div>
        </div>
      </div>
      <div className="max-h-[640px] overflow-y-auto">
        <div className="px-5 pb-1 pt-4">
          <div className="text-[19px] font-semibold leading-snug tracking-[-0.01em]">{subject}</div>
          <div className="mt-2.5 flex items-center gap-2.5 text-[12px] text-[#6b7086]">
            <SenderAvatar name={content.fromName} accent={org.accent} size={28} />
            <div className="min-w-0">
              <div className="truncate">
                <span className="font-semibold text-[#111427]">{content.fromName}</span> &lt;{content.fromEmail || "adresse d'envoi"}&gt;
              </div>
              <div className="truncate">À : {sample.full_name} &lt;{sample.email}&gt;</div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <EmailDocument content={content} sample={sample} org={org} />
        </div>
      </div>
    </div>
  );
}

function PhoneFrame({ content, sample, org }: { content: EmailContent; sample: SampleContact; org: EmailOrg }) {
  const subject = personalize(content.subject, sample) || "(sans objet)";
  return (
    <div className="mx-auto w-[336px] max-w-full rounded-[48px] bg-[#0b0d17] p-[10px] shadow-[0_30px_70px_-25px_rgba(10,14,40,.7),inset_0_0_0_1.5px_rgba(255,255,255,.12)]">
      <div className="relative h-[640px] overflow-hidden rounded-[38px] bg-white text-[#111427]">
        <div className="absolute left-1/2 top-2.5 z-10 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#0b0d17]" />
        <div className="flex items-center justify-between px-7 pb-1 pt-3.5 text-[13px] font-semibold">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="size-3.5" />
            <Wifi className="size-3.5" />
            <BatteryFull className="size-4" />
          </span>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 text-[14px] font-medium text-[#3b6cff]">
          <ChevronLeft className="size-5" /> Boîte de réception
        </div>
        <div className="h-[calc(100%-78px)] overflow-y-auto">
          <div className="px-4 pb-2">
            <div className="text-[17px] font-semibold leading-snug">{subject}</div>
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[#6b7086]">
              <SenderAvatar name={content.fromName} accent={org.accent} size={26} />
              <span className="min-w-0 truncate">
                <span className="font-semibold text-[#111427]">{content.fromName}</span> · à moi
              </span>
            </div>
          </div>
          <EmailDocument content={content} sample={sample} org={org} compact />
        </div>
      </div>
    </div>
  );
}

/** Live preview of a campaign in a mail-client frame, desktop or mobile. */
export function EmailPreview({
  content,
  sample,
  org,
  className,
  samples,
  onSampleChange,
}: {
  content: EmailContent;
  sample: SampleContact;
  org: EmailOrg;
  className?: string;
  samples?: { id: number; name: string }[];
  onSampleChange?: (id: number) => void;
}) {
  const [device, setDevice] = useLocalStorage<"desktop" | "mobile">("prisme-mail-preview-device", "desktop");
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: <span className="flex items-center gap-1.5"><Monitor className="size-3.5" />Ordinateur</span> },
            { value: "mobile", label: <span className="flex items-center gap-1.5"><Smartphone className="size-3.5" />Mobile</span> },
          ]}
        />
        <label className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
          Aperçu pour
          {samples && samples.length > 1 && onSampleChange ? (
            <select value={sample.id ?? ""} onChange={(e) => onSampleChange(Number(e.target.value))} className="max-w-[170px] cursor-pointer truncate rounded-[8px] bg-transparent py-0.5 font-medium text-fg-2 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              {samples.map((s) => (
                <option key={s.id} value={s.id} className="bg-[var(--glass-solid)] text-fg">
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate font-medium text-fg-2">{sample.full_name}</span>
          )}
        </label>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={device} initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
          {device === "desktop" ? <DesktopFrame content={content} sample={sample} org={org} /> : <PhoneFrame content={content} sample={sample} org={org} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
