"""Recurring revenue: MRR movement log and SaaS metrics (MRR, ARR, churn, NRR, ARPA)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlmodel import Session, select

from ..models import Company, Subscription, SubscriptionChange, today


def record_mrr_change(session: Session, sub: Subscription, before: float, after: float, when: date | None = None, previous_status: str | None = None) -> None:
    delta = round((after or 0) - (before or 0), 2)
    if abs(delta) < 0.005:
        return
    if before <= 0 < after:
        has_history = session.exec(select(SubscriptionChange).where(SubscriptionChange.subscription_id == sub.id)).first()
        # Resuming a pause gives back MRR the pause took (expansion); a former customer coming back is a reactivation.
        kind = "expansion" if previous_status == "paused" else "reactivation" if has_history else "new"
    elif after <= 0 < before:
        kind = "contraction" if sub.status == "paused" else "churn"  # a pause keeps the customer: not churn
    elif delta > 0:
        kind = "expansion"
    else:
        kind = "contraction"
    session.add(
        SubscriptionChange(
            subscription_id=sub.id,
            company_id=sub.company_id,
            date=when or (sub.canceled_at if kind == "churn" and sub.canceled_at else today()),
            kind=kind,
            mrr_delta=delta,
            mrr_after=round(after or 0, 2),
        )
    )


def _month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _months_back(n: int) -> list[date]:
    first = today().replace(day=1)
    months = []
    y, m = first.year, first.month
    for _ in range(n):
        months.append(date(y, m, 1))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(months))


def metrics(session: Session, months: int = 12) -> dict[str, Any]:
    subs = session.exec(select(Subscription)).all()
    changes = session.exec(select(SubscriptionChange).order_by(SubscriptionChange.date)).all()
    current_mrr = round(sum(s.mrr for s in subs), 2)
    active = [s for s in subs if s.status in ("active", "past_due")]
    customers = {s.company_id for s in active}
    trialing = [s for s in subs if s.status == "trialing"]

    window = _months_back(months)
    keys = [_month_key(d) for d in window]
    movements: dict[str, dict[str, float]] = {k: defaultdict(float) for k in keys}  # type: ignore[misc]
    for ch in changes:
        k = _month_key(ch.date)
        if k in movements:
            movements[k][ch.kind] += ch.mrr_delta

    # MRR at end of each month = sum of deltas up to that month
    series = []
    running = sum(ch.mrr_delta for ch in changes if ch.date < window[0])
    for d, k in zip(window, keys):
        m = movements[k]
        running += sum(m.values())
        series.append(
            {
                "month": k,
                "mrr": round(running, 2),
                "new": round(m.get("new", 0), 2),
                "expansion": round(m.get("expansion", 0), 2),
                "reactivation": round(m.get("reactivation", 0), 2),
                "contraction": round(m.get("contraction", 0), 2),
                "churn": round(m.get("churn", 0), 2),
            }
        )

    # Churn & NRR over the last 30 days relative to MRR 30 days ago
    start = today() - timedelta(days=30)
    mrr_start = sum(ch.mrr_delta for ch in changes if ch.date < start)
    recent = [ch for ch in changes if ch.date >= start]
    churned = -sum(ch.mrr_delta for ch in recent if ch.kind == "churn")
    contraction = -sum(ch.mrr_delta for ch in recent if ch.kind == "contraction")
    expansion = sum(ch.mrr_delta for ch in recent if ch.kind in ("expansion", "reactivation"))
    churn_rate = (churned / mrr_start * 100) if mrr_start > 0 else 0.0
    nrr = ((mrr_start - churned - contraction + expansion) / mrr_start * 100) if mrr_start > 0 else 100.0
    churned_logos = len({ch.subscription_id for ch in recent if ch.kind == "churn"})
    logos_start = len({s.id for s in subs if s.start_date and s.start_date < start and (s.canceled_at is None or s.canceled_at >= start)})
    plans: dict[str, dict[str, float]] = {}
    for s in active:
        p = plans.setdefault(s.plan, {"plan": s.plan, "mrr": 0.0, "count": 0})
        p["mrr"] += s.mrr
        p["count"] += 1
    names = {c.id: c.name for c in session.exec(select(Company).where(Company.id.in_({s.company_id for s in active}))).all()}
    renewals = sorted(
        [
            {"id": s.id, "plan": s.plan, "company_id": s.company_id, "company": names.get(s.company_id), "date": s.current_period_end.isoformat(), "amount": s.amount * s.quantity}
            for s in active
            if s.current_period_end and today() <= s.current_period_end <= today() + timedelta(days=45)
        ],
        key=lambda r: r["date"],
    )
    return {
        "mrr": current_mrr,
        "arr": round(current_mrr * 12, 2),
        "active_subscriptions": len(active),
        "customers": len(customers),
        "trialing": len(trialing),
        "arpa": round(current_mrr / len(customers), 2) if customers else 0,
        "churn_rate": round(churn_rate, 2),
        "logo_churn_rate": round(churned_logos / logos_start * 100, 2) if logos_start else 0,
        "nrr": round(nrr, 1),
        "series": series,
        "plans": sorted(({**p, "mrr": round(p["mrr"], 2)} for p in plans.values()), key=lambda p: -p["mrr"]),
        "renewals": renewals[:20],
    }
