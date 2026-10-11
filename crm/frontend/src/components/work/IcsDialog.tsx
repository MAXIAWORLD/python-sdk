import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarSync, Check, Copy, Download, KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { api, download } from "@/lib/api";
import { date, relative } from "@/lib/format";
import { toastError } from "@/lib/hooks";
import type { ApiToken } from "@/lib/types";

/** The ICS feed authenticates with a personal API token passed as `?key=` (scope "api"). */
const TOKEN_NAME = "Abonnement agenda (ICS)";

const APPS = [
  { name: "Google Agenda", how: "Autres agendas › « + » › À partir de l'URL" },
  { name: "Apple Calendrier", how: "Fichier › Nouvel abonnement à un calendrier" },
  { name: "Outlook", how: "Ajouter un calendrier › S'abonner à partir du web" },
];

export function IcsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tokens = useQuery({ queryKey: ["auth-tokens"], queryFn: () => api.get<{ items: ApiToken[] }>("/auth/tokens"), enabled: open });
  const keys = (tokens.data?.items ?? []).filter((t) => t.name === TOKEN_NAME);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();

  const create = useMutation({
    mutationFn: () => api.post<{ token: string; item: ApiToken }>("/auth/tokens", { name: TOKEN_NAME, scopes: ["api"] }),
    onSuccess: (res) => {
      setUrl(`${window.location.origin}/api/calendar.ics?key=${encodeURIComponent(res.token)}`);
      setCopied(false);
      tokens.refetch();
    },
    onError: toastError,
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Adresse copiée", { description: "Collez-la dans votre application d'agenda." });
    } catch {
      toast.error("Copie impossible : sélectionnez l'adresse et copiez-la manuellement.");
    }
  };

  const revoke = async (t: ApiToken) => {
    if (!(await confirm({ title: "Révoquer cette clé ?", description: "Les agendas abonnés avec cette adresse cesseront de se synchroniser.", danger: true, confirmLabel: "Révoquer" }))) return;
    try {
      await api.delete(`/auth/tokens/${t.id}`);
      toast.success("Clé révoquée");
      tokens.refetch();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setUrl(null);
      }}
      size="md"
      icon={<CalendarSync className="size-5" />}
      title="S'abonner à l'agenda"
      description="Retrouvez vos rendez-vous Prisme et vos tâches à échéance dans Google Agenda, Apple Calendrier ou Outlook (lecture seule, synchronisation automatique)."
      footer={
        <>
          <Button variant="ghost" icon={<Download className="size-4" />} className="mr-auto" onClick={() => download("/calendar.ics", "prisme-agenda.ics").catch(toastError)}>
            Télécharger (.ics)
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Terminé
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {url ? (
          <div className="space-y-2.5">
            <div className="text-[12.5px] font-medium text-fg-2">Votre adresse d'abonnement personnelle</div>
            <div className="glass-inset flex items-center gap-2 rounded-[14px] p-1.5 pl-3">
              <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none" aria-label="Adresse d'abonnement ICS" />
              <Button size="sm" variant={copied ? "subtle" : "primary"} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy}>
                {copied ? "Copiée" : "Copier"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="glass">
                <a href={url.replace(/^https?:/, "webcal:")}>
                  <CalendarSync className="size-3.5" /> Ouvrir dans mon agenda
                </a>
              </Button>
            </div>
            <div className="flex items-start gap-2.5 rounded-[14px] bg-amber-400/15 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>Cette adresse n'est affichée qu'une fois et contient une clé personnelle liée à votre compte : ne la partagez pas. En cas de fuite, révoquez-la ci-dessous.</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[18px] bg-black/[0.025] px-5 py-6 text-center dark:bg-white/[0.035]">
            <p className="max-w-sm text-[13px] text-fg-2">Une clé personnelle est générée pour que votre application d'agenda puisse lire le flux sans votre mot de passe.</p>
            <Button variant="primary" icon={<KeyRound className="size-4" />} loading={create.isPending} onClick={() => create.mutate()}>
              Générer mon adresse d'abonnement
            </Button>
          </div>
        )}

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">Où la coller ?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {APPS.map((a) => (
              <div key={a.name} className="rounded-[14px] bg-black/[0.025] px-3 py-2.5 dark:bg-white/[0.035]">
                <div className="text-[13px] font-semibold">{a.name}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{a.how}</div>
              </div>
            ))}
          </div>
        </div>

        {keys.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-3">Clés d'abonnement actives</div>
            <div className="divide-y divide-[var(--hairline)] rounded-[14px] bg-black/[0.025] dark:bg-white/[0.035]">
              {keys.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <KeyRound className="size-4 shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12.5px]">{t.prefix}…</div>
                    <div className="text-[11.5px] text-fg-3">
                      Créée le {date(t.created_at)} · {t.last_used_at ? `utilisée ${relative(t.last_used_at)}` : "jamais utilisée"}
                    </div>
                  </div>
                  <Button size="xs" variant="ghost" className="text-red-500" onClick={() => revoke(t)}>
                    Révoquer
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
