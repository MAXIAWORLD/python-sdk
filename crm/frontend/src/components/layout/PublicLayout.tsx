import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { Backdrop } from "@/components/glass/Backdrop";
import { LogoMark } from "@/components/layout/Logo";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface PublicBranding {
  app_name: string;
  accent?: string | null;
  company?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  privacy_url?: string | null;
  dpo_email?: string | null;
}

/** Branding of the organisation for public pages (no session required). */
export function usePublicBranding() {
  return useQuery({ queryKey: ["public-branding"], queryFn: () => api.get<PublicBranding>("/public/branding"), staleTime: 5 * 60_000 });
}

/**
 * Frame for every public page (signed quote, invoice, lead form, unsubscribe, help center):
 * organisation identity on top, glass content, legal footer.
 */
export function PublicLayout({ children, width = "md", title, subtitle, actions }: { children: ReactNode; width?: "sm" | "md" | "lg" | "xl"; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  const { data: brand } = usePublicBranding();
  const widths = { sm: "max-w-[480px]", md: "max-w-[720px]", lg: "max-w-[960px]", xl: "max-w-[1180px]" };

  useEffect(() => {
    if (brand?.accent) document.documentElement.style.setProperty("--accent", brand.accent);
  }, [brand?.accent]);

  return (
    <div className="relative min-h-screen">
      <Backdrop variant="public" />
      <div className={cn("mx-auto px-4 pb-10 pt-6 sm:px-6 sm:pt-10", widths[width])}>
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {brand?.logo_url ? <img src={brand.logo_url} alt="" className="size-11 rounded-[14px] object-contain shadow-[var(--glass-shadow)]" /> : <LogoMark size={44} />}
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold tracking-[-0.02em]">{brand?.company || brand?.app_name || " "}</div>
              {brand?.website && (
                <a href={brand.website.startsWith("http") ? brand.website : `https://${brand.website}`} target="_blank" rel="noreferrer" className="text-[12px] text-fg-3 hover:text-fg-2">
                  {brand.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
        {(title || subtitle) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
            {title && <h1 className="text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]">{title}</h1>}
            {subtitle && <p className="mt-1 text-[14px] text-fg-2">{subtitle}</p>}
          </motion.div>
        )}
        <motion.main initial={{ opacity: 0, y: 14, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 180, damping: 24 }}>
          {children}
        </motion.main>
        <footer className="mt-10 flex flex-col items-center gap-1.5 text-center text-[11.5px] text-fg-3">
          <div>
            {brand?.legal_name || brand?.company}
            {brand?.email ? ` · ${brand.email}` : ""}
            {brand?.phone ? ` · ${brand.phone}` : ""}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {brand?.privacy_url && (
              <a href={brand.privacy_url} target="_blank" rel="noreferrer" className="hover:text-fg-2">
                Politique de confidentialité
              </a>
            )}
            {brand?.dpo_email && <span>Données personnelles : {brand.dpo_email}</span>}
            <span className="inline-flex items-center gap-1">
              Propulsé par <LogoMark size={14} /> Prisme
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
