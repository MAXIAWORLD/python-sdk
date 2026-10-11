import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { date, money, moneyShort } from "@/lib/format";
import { toastError, useInvalidate } from "@/lib/hooks";
import type { Invoice, Subscription } from "@/lib/types";
import { monthlyValue, nextInvoicePeriod } from "./model";

/** Status changes and billing actions shared by the list, the side sheet and the panels. */
export function useSubscriptionActions() {
  const confirm = useConfirm();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => invalidate("subscriptions", "subscription-metrics", "subscription-changes");

  const patch = async (sub: Subscription, data: Record<string, unknown>, key: string) => {
    setBusy(`${key}-${sub.id}`);
    try {
      await api.patch(`/subscriptions/${sub.id}`, data);
      refresh();
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const client = (sub: Subscription) => sub.company?.name ?? "ce client";

  return {
    busy,
    isBusy: (key: string, sub: Subscription) => busy === `${key}-${sub.id}`,

    pause: async (sub: Subscription) => {
      const ok = await confirm({
        title: `Mettre en pause l'abonnement de ${client(sub)} ?`,
        description: `${sub.plan} sort du MRR pendant la pause (−${moneyShort(monthlyValue(sub))}/mois, tracé comme churn) puis sera réintégré à la reprise. Aucune facture n'est générée pendant la pause.`,
        confirmLabel: "Mettre en pause",
      });
      if (ok && (await patch(sub, { status: "paused" }, "pause"))) toast.success("Abonnement mis en pause", { description: `${client(sub)} · ${sub.plan}` });
    },

    resume: async (sub: Subscription) => {
      if (await patch(sub, { status: "active" }, "resume")) toast.success("Abonnement repris", { description: `+${moneyShort(monthlyValue(sub))} de MRR réintégrés` });
    },

    reactivate: async (sub: Subscription) => {
      const ok = await confirm({
        title: `Réactiver l'abonnement de ${client(sub)} ?`,
        description: `${sub.plan} redevient actif et réintègre ${moneyShort(monthlyValue(sub))} de MRR (mouvement de réactivation).`,
        confirmLabel: "Réactiver",
      });
      if (ok && (await patch(sub, { status: "active", cancel_reason: null }, "reactivate"))) toast.success("Abonnement réactivé");
    },

    convertTrial: async (sub: Subscription) => {
      if (await patch(sub, { status: "active" }, "convert")) toast.success("Essai converti en abonnement payant 🎉", { description: `${client(sub)} · +${moneyShort(monthlyValue(sub))} de MRR` });
    },

    toggleAutoInvoice: async (sub: Subscription, value: boolean) => {
      if (await patch(sub, { auto_invoice: value }, "auto"))
        toast.success(value ? "Facturation automatique activée" : "Facturation automatique désactivée", {
          description: value ? "Une facture brouillon sera créée à chaque échéance." : undefined,
        });
    },

    generateInvoice: async (sub: Subscription) => {
      const period = nextInvoicePeriod(sub);
      const ok = await confirm({
        title: "Générer la facture de la prochaine période ?",
        description: `Une facture brouillon « ${sub.plan} » couvrant la période du ${date(period.start)} au ${date(period.end)} sera créée pour ${client(sub)}. La prochaine échéance passera au ${date(period.next)}.`,
        confirmLabel: "Générer la facture",
      });
      if (!ok) return;
      setBusy(`invoice-${sub.id}`);
      try {
        const invoice = await api.post<Invoice>(`/subscriptions/${sub.id}/invoice`);
        toast.success("Facture brouillon créée", { description: `${sub.plan} · ${money(invoice.total, invoice.currency)} TTC` });
        invalidate("subscriptions", "subscription-metrics", "invoices");
        navigate(`/invoices/${invoice.id}`);
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(null);
      }
    },
  };
}

export type SubscriptionActions = ReturnType<typeof useSubscriptionActions>;
