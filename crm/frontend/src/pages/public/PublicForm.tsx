import { useQuery } from "@tanstack/react-query";
import { FileQuestion, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { Glass } from "@/components/glass/Glass";
import { PublicLayout, usePublicBranding, type PublicBranding } from "@/components/layout/PublicLayout";
import { LogoMark } from "@/components/layout/Logo";
import { LeadFormRenderer, type RenderableForm, type SubmitPayload, type SubmitResult } from "@/components/marketing/LeadFormRenderer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { api, ApiError } from "@/lib/api";

interface PublicFormResponse extends RenderableForm {
  slug: string;
  theme?: Record<string, unknown>;
  branding?: PublicBranding;
}

/** Embedded in an <iframe> (?embed=1): transparent page, light theme unless ?theme=dark. */
function useEmbedChrome(embed: boolean, dark: boolean) {
  useEffect(() => {
    if (!embed) return;
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    const prev = { html: root.style.background, body: document.body.style.background };
    root.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      root.classList.toggle("dark", hadDark);
      root.style.background = prev.html;
      document.body.style.background = prev.body;
    };
  }, [embed, dark]);
}

function FormSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-12" />
      <Skeleton className="h-28" />
      <Skeleton className="h-[52px]" />
    </div>
  );
}

function Unavailable({ error, contact, onRetry }: { error: unknown; contact?: string | null; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      <span className="glass flex size-16 items-center justify-center rounded-[20px] text-accent">{notFound ? <FileQuestion className="size-7" /> : <WifiOff className="size-7" />}</span>
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">{notFound ? "Formulaire indisponible" : "Chargement impossible"}</h1>
      <p className="mt-1.5 max-w-sm text-[14.5px] leading-relaxed text-fg-2">
        {notFound ? `Ce formulaire n'existe pas ou n'accepte plus de réponses. Vérifiez le lien${contact ? ` ou écrivez-nous à ${contact}` : ""}.` : "Le formulaire n'a pas pu être chargé. Vérifiez votre connexion puis réessayez."}
      </p>
      {!notFound && (
        <Button variant="glass" className="mt-5" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

function EmbedFrame({ children, accent }: { children: ReactNode; accent?: string | null }) {
  useEffect(() => {
    if (accent) document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);
  return (
    <div className="min-h-screen p-2 sm:p-4">
      <div className="glass glass-solid mx-auto max-w-[680px] rounded-[24px] p-5 sm:p-8">{children}</div>
      <div className="mx-auto mt-3 flex w-fit items-center gap-1.5 text-[11px] text-fg-3">
        Propulsé par <LogoMark size={13} /> Prisme
      </div>
    </div>
  );
}

export default function PublicForm() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const embed = params.get("embed") === "1";
  useEmbedChrome(embed, params.get("theme") === "dark");
  const { data: brand } = usePublicBranding();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => api.get<PublicFormResponse>(`/public/forms/${encodeURIComponent(slug)}`),
    retry: false,
    staleTime: 60_000,
  });
  const branding = brand ?? data?.branding;

  useEffect(() => {
    if (data) document.title = `${data.title}${branding?.company ? ` — ${branding.company}` : ""}`;
  }, [data, branding?.company]);

  const submit = (payload: SubmitPayload) => api.post<SubmitResult>(`/public/forms/${encodeURIComponent(slug)}`, payload);

  const content = isLoading ? (
    <FormSkeleton />
  ) : error || !data ? (
    <Unavailable error={error} contact={branding?.email} onRetry={() => void refetch()} />
  ) : (
    <LeadFormRenderer form={data} privacy={{ privacyUrl: branding?.privacy_url, dpoEmail: branding?.dpo_email }} mode="public" onSubmit={submit} />
  );

  if (embed) return <EmbedFrame accent={branding?.accent}>{content}</EmbedFrame>;

  return (
    <PublicLayout width="md">
      <Glass variant="strong" radius="xl" glow className="px-5 py-7 sm:px-10 sm:py-10">
        {content}
      </Glass>
    </PublicLayout>
  );
}
