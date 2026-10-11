import { BatteryFull, Lock, Monitor, RotateCw, Signal, Smartphone, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Segmented } from "@/components/ui/tabs";
import { useLocalStorage } from "@/lib/hooks";
import { LeadFormRenderer, type FormPrivacy, type RenderableForm } from "./LeadFormRenderer";

/** Soft "public page" backdrop behind the glass card, like the real /f/ page. */
function PageBackdrop({ children, company }: { children: ReactNode; company?: string | null }) {
  return (
    <div className="relative isolate overflow-hidden bg-[var(--bg)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-16 -top-20 size-72 rounded-full opacity-60 blur-3xl" style={{ background: "var(--blob-1)" }} />
        <div className="absolute -right-10 top-10 size-56 rounded-full opacity-50 blur-3xl" style={{ background: "var(--blob-2)" }} />
        <div className="absolute -bottom-24 left-1/3 size-72 rounded-full opacity-45 blur-3xl" style={{ background: "var(--blob-3)" }} />
      </div>
      <div className="flex items-center gap-2 px-5 pb-1 pt-4">
        <LogoMark size={26} />
        <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{company || "Votre entreprise"}</span>
      </div>
      {children}
    </div>
  );
}

/** Live preview of a lead form in a browser window or a phone. */
export function FormPreview({ form, privacy, url, company, successMessage }: { form: RenderableForm; privacy?: FormPrivacy; url: string; company?: string | null; successMessage: string }) {
  const [device, setDevice] = useLocalStorage<"desktop" | "mobile">("prisme-form-preview-device", "desktop");
  const renderer = <LeadFormRenderer form={form} privacy={privacy} mode="preview" previewMessage={successMessage} />;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Aperçu en direct
        </span>
        <Segmented
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: <span className="flex items-center gap-1.5"><Monitor className="size-3.5" />Ordinateur</span> },
            { value: "mobile", label: <span className="flex items-center gap-1.5"><Smartphone className="size-3.5" />Mobile</span> },
          ]}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={device} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.2 }}>
          {device === "desktop" ? (
            <div className="overflow-hidden rounded-[18px] shadow-[0_24px_60px_-28px_rgba(20,30,90,.45)] ring-1 ring-[var(--hairline-strong)]">
              <div className="flex items-center gap-3 border-b border-[var(--hairline)] bg-[var(--glass-solid)] px-3.5 py-2.5">
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-black/[0.05] px-3 py-1 text-[11.5px] text-fg-2 dark:bg-white/[0.07]">
                  <Lock className="size-3 shrink-0 text-emerald-600" />
                  <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                </span>
                <RotateCw className="size-3.5 text-fg-3" />
              </div>
              <div className="max-h-[720px] overflow-y-auto">
                <PageBackdrop company={company}>
                  <div className="px-4 pb-6 pt-3 sm:px-6">
                    <div className="glass glass-strong rounded-[24px] p-5 sm:p-7">{renderer}</div>
                  </div>
                </PageBackdrop>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-[336px] max-w-full rounded-[48px] bg-[#0b0d17] p-[10px] shadow-[0_30px_70px_-25px_rgba(10,14,40,.7),inset_0_0_0_1.5px_rgba(255,255,255,.12)]">
              <div className="relative h-[660px] overflow-hidden rounded-[38px] bg-[var(--bg)]">
                <div className="absolute left-1/2 top-2.5 z-30 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#0b0d17]" />
                <div className="relative z-20 flex items-center justify-between px-7 pb-1 pt-3.5 text-[13px] font-semibold">
                  <span>9:41</span>
                  <span className="flex items-center gap-1">
                    <Signal className="size-3.5" />
                    <Wifi className="size-3.5" />
                    <BatteryFull className="size-4" />
                  </span>
                </div>
                <div className="h-[calc(100%-36px)] overflow-y-auto">
                  <PageBackdrop company={company}>
                    <div className="px-3 pb-6 pt-2">
                      <div className="glass glass-strong rounded-[22px] p-4">{renderer}</div>
                    </div>
                  </PageBackdrop>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
