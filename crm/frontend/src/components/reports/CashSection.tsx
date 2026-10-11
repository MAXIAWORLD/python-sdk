import { differenceInCalendarDays } from "date-fns";
import { AlarmClock, CalendarClock, CreditCard, FileWarning, HandCoins, Sparkles, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { BarList } from "@/components/charts/Charts";
import { StatTile } from "@/components/data/blocks";
import { IconButton } from "@/components/ui/button";
import { PAYMENT_METHODS, labelOf } from "@/lib/constants";
import { date, money, moneyShort, number, percent } from "@/lib/format";
import { useList } from "@/lib/hooks";
import type { Invoice, Payment } from "@/lib/types";
import { useUI } from "@/stores/ui";
import { SeriesColumns } from "./charts";
import { monthInPeriod, pct, usePeriodRows, type Period, type ReportsData } from "./data";
import { ReportPanel, type TableColumn } from "./kit";

const BUCKETS = [
  { key: "current", label: "Non échues", test: (late: number) => late <= 0 },
  { key: "b30", label: "Retard de 1 à 30 j", test: (late: number) => late > 0 && late <= 30 },
  { key: "b60", label: "Retard de 31 à 60 j", test: (late: number) => late > 30 && late <= 60 },
  { key: "b90", label: "Retard de 61 à 90 j", test: (late: number) => late > 60 && late <= 90 },
  { key: "b90p", label: "Retard de plus de 90 j", test: (late: number) => late > 90 },
];

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

type OpenInvoice = Invoice & { late: number };

export function CashSection({ period, report }: { period: Period; report?: ReportsData }) {
  const openAssistant = useUI((s) => s.openAssistant);
  const payments = usePeriodRows<Payment>("payments", period, { serverField: "date", params: { expand: 0 } });
  const prevPayments = useList<Payment>("payments", { date__gte: period.prevStartIso, date__lt: period.prevEndIso, limit: 1000, expand: 0 });
  const open = useList<Invoice>("invoices", { status__in: "issued,sent,partial,overdue", kind__ne: "credit_note", limit: 1000, sort: "due_date" });
  const paid = usePeriodRows<Invoice>("invoices", period, { clientField: "paid_at", params: { status: "paid", expand: 0 } });

  const cash = sum(payments.items.map((p) => p.amount));
  const prevCash = prevPayments.data ? sum(prevPayments.data.items.map((p) => p.amount)) : null;

  const receivables = useMemo(() => {
    const today = new Date();
    const rows: OpenInvoice[] = (open.data?.items ?? []).filter((i) => i.balance_due > 0).map((i) => ({ ...i, late: i.due_date ? differenceInCalendarDays(today, new Date(`${i.due_date}T12:00:00`)) : 0 }));
    const buckets = BUCKETS.map((b) => {
      const inv = rows.filter((r) => b.test(r.late));
      return { key: b.key, label: b.label, count: inv.length, amount: sum(inv.map((r) => r.balance_due)) };
    });
    const overdue = rows.filter((r) => r.late > 0).sort((a, b) => b.late - a.late);
    return { rows, buckets, overdue, total: sum(rows.map((r) => r.balance_due)), overdueTotal: sum(overdue.map((r) => r.balance_due)) };
  }, [open.data]);

  const methods = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const p of payments.items) {
      const m = map.get(p.method) ?? { amount: 0, count: 0 };
      map.set(p.method, { amount: m.amount + p.amount, count: m.count + 1 });
    }
    return Array.from(map, ([method, v]) => ({ method, label: labelOf(PAYMENT_METHODS, method), ...v })).sort((a, b) => b.amount - a.amount);
  }, [payments.items]);

  const delays = paid.items.filter((i) => i.paid_at && i.issue_date).map((i) => Math.max(0, differenceInCalendarDays(new Date(i.paid_at as string), new Date(`${i.issue_date}T12:00:00`))));
  const avgDelay = delays.length ? sum(delays) / delays.length : null;

  const cashRows = (report?.revenue_series ?? []).map((r) => ({ ...r, active: monthInPeriod(period, r.month) }));

  const cashCols: TableColumn<(typeof cashRows)[number]>[] = [
    { key: "m", header: "Mois", cell: (r) => <span className="capitalize">{r.label}</span>, csv: (r) => r.month },
    { key: "c", header: "Encaissements", align: "right", cell: (r) => money(r.cash, "EUR", { decimals: 0 }), csv: (r) => r.cash },
    { key: "r", header: "CA HT facturé", align: "right", hideOnMobile: true, cell: (r) => money(r.revenue, "EUR", { decimals: 0 }), csv: (r) => r.revenue },
  ];
  const methodCols: TableColumn<(typeof methods)[number]>[] = [
    { key: "m", header: "Moyen de paiement", cell: (r) => r.label, csv: (r) => r.label },
    { key: "n", header: "Règlements", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "a", header: "Montant", align: "right", cell: (r) => money(r.amount, "EUR", { decimals: 0 }), csv: (r) => r.amount },
  ];
  const bucketCols: TableColumn<(typeof receivables.buckets)[number]>[] = [
    { key: "l", header: "Ancienneté", cell: (r) => r.label, csv: (r) => r.label },
    { key: "n", header: "Factures", align: "right", cell: (r) => number(r.count), csv: (r) => r.count },
    { key: "a", header: "Reste dû TTC", align: "right", cell: (r) => money(r.amount), csv: (r) => r.amount },
    { key: "p", header: "Part", align: "right", hideOnMobile: true, cell: (r) => percent(receivables.total ? (r.amount / receivables.total) * 100 : 0, 1), csv: (r) => (receivables.total ? (r.amount / receivables.total) * 100 : 0) },
  ];
  const overdueCols: TableColumn<OpenInvoice>[] = [
    {
      key: "n",
      header: "Facture",
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="whitespace-nowrap font-medium hover:text-accent">
          {r.number}
        </Link>
      ),
      csv: (r) => r.number,
    },
    { key: "c", header: "Client", cell: (r) => <span className="line-clamp-1">{r.company?.name ?? r.buyer?.name ?? "—"}</span>, csv: (r) => r.company?.name ?? r.buyer?.name ?? "" },
    { key: "d", header: "Échéance", csvOnly: true, cell: (r) => date(r.due_date, "d MMM yy"), csv: (r) => r.due_date ?? "" },
    { key: "l", header: "Retard", align: "right", cell: (r) => <span className={r.late > 60 ? "whitespace-nowrap font-semibold text-red-500" : "whitespace-nowrap"} title={`Échéance : ${date(r.due_date)}`}>{number(r.late)} j</span>, csv: (r) => r.late },
    { key: "a", header: "Reste dû", align: "right", cell: (r) => <span className="whitespace-nowrap">{money(r.balance_due, "EUR", { decimals: 0 })}</span>, csv: (r) => r.balance_due },
    {
      key: "x",
      header: "",
      align: "right",
      cell: (r) => (
        <IconButton
          size="xs"
          label="Préparer la relance avec Iris"
          onClick={() => openAssistant(`Rédige une relance courtoise mais ferme pour la facture ${r.number} de ${r.company?.name ?? "ce client"} : reste dû ${money(r.balance_due)}, échue depuis ${r.late} jours. Rappelle les pénalités de retard et l'indemnité forfaitaire de 40 €.`)}
        >
          <Sparkles className="size-3.5 text-[#b26bff]" />
        </IconButton>
      ),
      csv: () => null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Encaissé sur la période" value={cash} format={(v) => moneyShort(v)} delta={prevCash !== null ? (pct(cash, prevCash) ?? undefined) : undefined} period="vs période préc." hint={`${number(payments.items.length)} règlement${payments.items.length > 1 ? "s" : ""}`} icon={<Wallet className="size-4" />} accent="linear-gradient(135deg,#10b981,#22d3ee)" />
        <StatTile label="Créances clients" value={receivables.total} format={(v) => moneyShort(v)} hint={`${number(receivables.rows.length)} facture${receivables.rows.length > 1 ? "s" : ""} à encaisser`} icon={<HandCoins className="size-4" />} />
        <StatTile label="Dont échues" value={receivables.overdueTotal} format={(v) => moneyShort(v)} hint={`${number(receivables.overdue.length)} facture${receivables.overdue.length > 1 ? "s" : ""} · ${percent(receivables.total ? (receivables.overdueTotal / receivables.total) * 100 : 0, 0)} des créances`} icon={<AlarmClock className="size-4" />} accent="linear-gradient(135deg,#fb923c,#f43f5e)" />
        <StatTile label="Délai moyen d'encaissement" value={avgDelay ?? 0} format={(v) => (avgDelay === null ? "—" : `${number(v)} j`)} hint={delays.length ? `${number(delays.length)} facture${delays.length > 1 ? "s" : ""} réglée${delays.length > 1 ? "s" : ""}` : "aucune facture réglée"} icon={<CalendarClock className="size-4" />} accent="linear-gradient(135deg,#8b5cf6,#ec4899)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ReportPanel
          className="xl:col-span-2"
          title="Encaissements par mois"
          description="Règlements reçus · 12 derniers mois"
          icon={<Wallet className="size-4" />}
          loading={!report}
          chart={<SeriesColumns data={cashRows.map((r) => ({ label: r.label, value: r.cash, active: r.active }))} valueLabel="Encaissements" format={(v) => money(v, "EUR", { decimals: 0 })} axisFormat={(v) => moneyShort(v)} />}
          table={{ columns: cashCols, rows: cashRows, footer: { month: "Total", label: "Total", revenue: sum(cashRows.map((r) => r.revenue)), cash: sum(cashRows.map((r) => r.cash)), active: true } }}
          csvName="encaissements-par-mois"
        />
        <ReportPanel
          title="Par moyen de paiement"
          description="Règlements de la période"
          icon={<CreditCard className="size-4" />}
          loading={payments.loading}
          empty={!methods.length}
          emptyText="Aucun règlement sur la période."
          chart={<BarList items={methods.map((m) => ({ label: m.label, value: m.amount, sub: `${m.count} règlement${m.count > 1 ? "s" : ""}` }))} format={(v) => moneyShort(v)} />}
          table={{ columns: methodCols, rows: methods }}
          csvName="encaissements-par-moyen"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportPanel
          title="Balance âgée des créances"
          description={`Au ${date(new Date(), "d MMMM yyyy")} · ${moneyShort(receivables.total)} TTC à encaisser`}
          icon={<HandCoins className="size-4" />}
          loading={open.isLoading}
          empty={!receivables.rows.length}
          emptyText="Aucune créance en cours."
          chart={<BarList items={receivables.buckets.map((b) => ({ label: b.label, value: b.amount, sub: `${b.count} facture${b.count > 1 ? "s" : ""} · ${percent(receivables.total ? (b.amount / receivables.total) * 100 : 0, 0)}` }))} format={(v) => moneyShort(v)} max={Math.max(1, ...receivables.buckets.map((b) => b.amount))} />}
          table={{ columns: bucketCols, rows: receivables.buckets, footer: { key: "total", label: "Total", count: receivables.rows.length, amount: receivables.total } }}
          csvName="balance-agee"
        />
        <ReportPanel
          title="Factures échues à relancer"
          description="Les plus anciennes d'abord · ✨ pour rédiger la relance avec Iris"
          icon={<FileWarning className="size-4" />}
          loading={open.isLoading}
          empty={!receivables.overdue.length}
          emptyText="Aucune facture en retard."
          table={{ columns: overdueCols, rows: receivables.overdue }}
          csvName="factures-echues"
          extra={
            <Link to="/invoices?status=overdue" className="mr-1 hidden text-[12.5px] font-medium text-accent sm:inline">
              Tout voir
            </Link>
          }
        />
      </div>
    </div>
  );
}
