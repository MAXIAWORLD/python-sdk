"""Default configuration and a realistic demo dataset (SaaS / Web3 + agence de services)."""

from __future__ import annotations

import random
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlmodel import Session, func, select

from .models import (
    Activity,
    Automation,
    Campaign,
    Company,
    Contact,
    Deal,
    EmailTemplate,
    Event,
    Form,
    Invoice,
    KbArticle,
    Notification,
    Payment,
    Pipeline,
    Product,
    Project,
    Quote,
    Segment,
    Stage,
    Subscription,
    SubscriptionChange,
    Task,
    Ticket,
    TicketMessage,
    TimeEntry,
    User,
    today,
    utcnow,
)
from .security import hash_password
from .services import invoicing
from .services.settings import get_section, update_section

PIPELINES = [
    (
        "Ventes SaaS",
        "sales",
        "#5b6cff",
        [("Nouveau lead", 10, "#8e8e93"), ("Qualification", 20, "#64d2ff"), ("Démo", 40, "#5e5ce6"), ("Proposition", 60, "#bf5af2"), ("Négociation", 80, "#ff9f0a"), ("Gagné", 100, "#30d158"), ("Perdu", 0, "#ff453a")],
    ),
    (
        "Projets & Services",
        "services",
        "#bf5af2",
        [("Brief reçu", 10, "#8e8e93"), ("Cadrage", 30, "#64d2ff"), ("Devis envoyé", 60, "#5e5ce6"), ("Validation", 80, "#ff9f0a"), ("Signé", 100, "#30d158"), ("Perdu", 0, "#ff453a")],
    ),
    (
        "Partenariats Web3",
        "partnership",
        "#30d5c8",
        [("Identifié", 10, "#8e8e93"), ("Premier échange", 30, "#64d2ff"), ("Term sheet", 60, "#bf5af2"), ("Signé", 100, "#30d158"), ("Abandonné", 0, "#ff453a")],
    ),
]

TEMPLATES = [
    ("Relance après démo", "Suivi", "Suite à notre démonstration, {{contact.first_name}}", "Bonjour {{contact.first_name}},\n\nMerci encore pour votre temps lors de la démonstration. Comme convenu, je reste disponible pour répondre à vos questions et préparer une proposition adaptée à vos équipes.\n\nSeriez-vous disponible la semaine prochaine pour un point de 20 minutes ?\n\nBien cordialement,\n{{user.name}}"),
    ("Premier contact", "Prospection", "{{contact.first_name}}, une idée pour vos équipes", "Bonjour {{contact.first_name}},\n\nJe me permets de vous contacter car nous aidons des entreprises comme la vôtre à centraliser ventes, facturation et support en un seul outil.\n\nAuriez-vous 15 minutes pour en discuter ?\n\nBien à vous,\n{{user.name}}"),
    ("Bienvenue client", "Onboarding", "Bienvenue chez nous 🎉", "Bonjour {{contact.first_name}},\n\nNous sommes ravis de démarrer cette collaboration. Votre interlocuteur dédié vous contactera sous 48 h pour planifier le lancement.\n\nÀ très vite,\n{{user.name}}"),
    ("Relance devis", "Suivi", "Votre devis — avez-vous des questions ?", "Bonjour {{contact.first_name}},\n\nJe reviens vers vous au sujet de notre proposition. Avez-vous pu en prendre connaissance ? Je peux l'ajuster si besoin.\n\nBien cordialement,\n{{user.name}}"),
    ("Demande d'avis", "Fidélisation", "Votre avis compte", "Bonjour {{contact.first_name}},\n\nVotre avis nous aide à progresser : pourriez-vous nous dire en deux minutes comment s'est passée notre collaboration ?\n\nMerci d'avance,\n{{user.name}}"),
]



def _slug(text: str) -> str:
    """ASCII, lowercase, email-safe local part (« Raphaël Da Silva » → « raphael.dasilva »)."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9.-]", "", plain.lower().replace(" ", ""))

def ensure_defaults(session: Session) -> None:
    if session.exec(select(func.count()).select_from(Pipeline)).one() == 0:
        for position, (name, kind, color, stages) in enumerate(PIPELINES):
            pipeline = Pipeline(name=name, kind=kind, color=color, position=position, is_default=position == 0)
            session.add(pipeline)
            session.flush()
            for idx, (stage_name, prob, stage_color) in enumerate(stages):
                session.add(Stage(pipeline_id=pipeline.id, name=stage_name, position=idx, probability=prob, color=stage_color, is_won=prob == 100, is_lost=prob == 0 and idx == len(stages) - 1, rotting_days=21 if 0 < prob < 100 else None))
        session.commit()
    if session.exec(select(func.count()).select_from(EmailTemplate)).one() == 0:
        for name, category, subject, body in TEMPLATES:
            session.add(EmailTemplate(name=name, category=category, subject=subject, body=body))
        session.commit()


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

FIRST = ["Camille", "Léa", "Hugo", "Lucas", "Chloé", "Inès", "Nathan", "Manon", "Jules", "Emma", "Louis", "Sarah", "Gabriel", "Zoé", "Arthur", "Jade", "Raphaël", "Alice", "Adam", "Lina", "Théo", "Clara", "Mathis", "Romane", "Noah", "Anaïs", "Paul", "Margaux", "Victor", "Juliette", "Samuel", "Elsa", "Maxime", "Lou", "Antoine", "Yasmine", "Thomas", "Pauline", "Karim", "Sofia"]
LAST = ["Durand", "Martin", "Bernard", "Petit", "Robert", "Richard", "Moreau", "Lefèvre", "Fontaine", "Garnier", "Chevalier", "Rousseau", "Blanc", "Guerin", "Faure", "Mercier", "Lambert", "Bonnet", "Girard", "Morel", "Roux", "Fournier", "Leroy", "Dupont", "Laurent", "Simon", "Michel", "Lemoine", "Benali", "Nguyen", "Da Silva", "Kowalski", "Haddad", "Perrin", "Marchand", "Colin"]
TITLES = ["CEO", "CTO", "COO", "Directeur commercial", "Head of Product", "Responsable marketing", "DAF", "Responsable achats", "Lead developer", "Fondateur", "Product Owner", "Directrice des opérations", "Head of Growth", "Responsable IT", "Office manager"]
SOURCES = ["Site web", "LinkedIn", "Recommandation", "Salon / événement", "Partenaire", "Prospection", "Webinar", "Formulaire"]

COMPANIES = [
    ("Solaris Labs", "Web3 / Blockchain", "Lyon", "solarislabs.io", "client", "11-50"),
    ("ChainForge", "Infrastructure blockchain", "Paris", "chainforge.dev", "client", "51-200"),
    ("NovaPay", "Fintech", "Paris", "novapay.fr", "client", "51-200"),
    ("Helios Énergie", "Énergie", "Nantes", "helios-energie.fr", "client", "201-500"),
    ("Atelier Lumen", "Agence design", "Bordeaux", "atelierlumen.fr", "partner", "1-10"),
    ("Krypto Garden", "NFT / Gaming", "Marseille", "kryptogarden.xyz", "prospect", "11-50"),
    ("Orbital Data", "Data & IA", "Toulouse", "orbitaldata.ai", "client", "51-200"),
    ("Vertigo Studio", "Jeu vidéo", "Montpellier", "vertigo-studio.com", "prospect", "11-50"),
    ("BioNexa", "Santé", "Strasbourg", "bionexa.health", "client", "201-500"),
    ("Maison Daumier", "Luxe", "Paris", "maison-daumier.com", "prospect", "51-200"),
    ("Quantix Capital", "Finance", "Paris", "quantix.capital", "client", "11-50"),
    ("Terra Nova Logistique", "Logistique", "Lille", "terranova-log.fr", "client", "201-500"),
    ("Pixel & Co", "Agence digitale", "Rennes", "pixelandco.fr", "partner", "11-50"),
    ("Aurora DAO", "DAO / DeFi", "Genève", "auroradao.org", "prospect", "1-10"),
    ("Cobalt Robotics", "Robotique", "Grenoble", "cobalt-robotics.fr", "client", "51-200"),
    ("BlockHarbor", "Web3 / Custody", "Luxembourg", "blockharbor.lu", "client", "11-50"),
    ("Nébuleuse Média", "Média", "Paris", "nebuleuse.media", "prospect", "11-50"),
    ("Kairos RH", "HR Tech", "Lyon", "kairos-rh.fr", "client", "11-50"),
    ("Fluxo Mobilité", "Mobilité", "Nice", "fluxo.app", "prospect", "11-50"),
    ("Agora Retail", "E-commerce", "Lille", "agora-retail.fr", "client", "51-200"),
    ("Polaris Edu", "EdTech", "Nantes", "polaris-edu.fr", "client", "11-50"),
    ("Carbone Zéro", "Climate tech", "Paris", "carbone-zero.eco", "prospect", "11-50"),
    ("Lynx Cybersécurité", "Cybersécurité", "Rennes", "lynx-cyber.fr", "client", "51-200"),
    ("Sirius Space", "Spatial", "Toulouse", "sirius-space.eu", "prospect", "51-200"),
    ("Céleste Hôtels", "Hôtellerie", "Annecy", "celeste-hotels.fr", "client", "201-500"),
    ("Glacier Analytics", "Data & IA", "Grenoble", "glacier-analytics.io", "prospect", "1-10"),
    ("Opale Finance", "Fintech", "Bordeaux", "opale.finance", "client", "11-50"),
    ("Atlas Avocats", "Juridique", "Paris", "atlas-avocats.fr", "client", "11-50"),
    ("Altitude Ventures", "Capital-risque", "Paris", "altitude.vc", "investor", "1-10"),
    ("Mosaïc Patrimoine", "Gestion de patrimoine", "Lyon", "mosaic-patrimoine.fr", "prospect", "11-50"),
    ("Delta Santé", "Santé", "Marseille", "delta-sante.fr", "prospect", "51-200"),
    ("Nomad Coffee", "Retail", "Paris", "nomad.coffee", "client", "11-50"),
    ("Ondine", "Eau & environnement", "Brest", "ondine.eco", "prospect", "11-50"),
    ("Zenith Assurances", "Assurance", "Niort", "zenith-assurances.fr", "prospect", "501-1000"),
    ("Hyperion Games", "Jeu vidéo / Web3", "Paris", "hyperion.gg", "client", "11-50"),
    ("Cartel Coworking", "Immobilier", "Lyon", "cartel-cowork.fr", "client", "11-50"),
]

PRODUCTS = [
    ("Prisme Cloud — Starter", "PLAN-STARTER", "subscription", "Abonnements", 49, "mois", "month"),
    ("Prisme Cloud — Pro", "PLAN-PRO", "subscription", "Abonnements", 149, "mois", "month"),
    ("Prisme Cloud — Business", "PLAN-BUSINESS", "subscription", "Abonnements", 499, "mois", "month"),
    ("Prisme Cloud — Enterprise", "PLAN-ENT", "subscription", "Abonnements", 1490, "mois", "month"),
    ("Maintenance & support premium", "SUP-PREMIUM", "subscription", "Abonnements", 390, "mois", "month"),
    ("Hébergement dédié", "HOST-DED", "subscription", "Abonnements", 290, "mois", "month"),
    ("Développement sur mesure", "DEV-JOUR", "service", "Prestations", 650, "jour", None),
    ("Audit de smart contract", "WEB3-AUDIT", "service", "Web3", 4500, "forfait", None),
    ("Intégration API", "INT-API", "service", "Prestations", 95, "heure", None),
    ("Conseil stratégique", "CONSEIL", "service", "Conseil", 1200, "jour", None),
    ("Formation équipe", "FORMATION", "service", "Formation", 1800, "jour", None),
    ("Design UX/UI", "DESIGN-JOUR", "service", "Prestations", 600, "jour", None),
    ("Licence on-premise", "LIC-ONPREM", "license", "Licences", 9900, "an", "year"),
    ("Tokenomics & whitepaper", "WEB3-TOKEN", "service", "Web3", 7500, "forfait", None),
]


def _luhn_siren(rng: random.Random) -> str:
    while True:
        base = "99" + "".join(str(rng.randint(0, 9)) for _ in range(6))
        for check in range(10):
            candidate = base + str(check)
            if invoicing.siren_is_valid(candidate):
                return candidate


def _dt(d: date, hour: int = 10, minute: int = 0) -> datetime:
    return datetime.combine(d, time(hour, minute), tzinfo=timezone.utc)


def seed_demo(session: Session, admin: User) -> None:
    rng = random.Random(42)
    t = today()

    company_cfg = get_section(session, "company")
    if not company_cfg.get("siren"):
        update_section(
            session,
            "company",
            {
                "name": company_cfg.get("name") or "Nova Studio",
                "legal_name": company_cfg.get("legal_name") or f"{company_cfg.get('name') or 'Nova Studio'} SAS",
                "legal_form": "SAS",
                "capital": "20 000",
                "address": "18 rue du Faubourg Saint-Antoine",
                "zip": "75011",
                "city": "Paris",
                "siren": "123456782",
                "siret": "12345678200017",
                "rcs_city": "Paris",
                "ape": "6201Z",
                "vat_number": "FR32123456782",
                "email": "facturation@exemple.fr",
                "phone": "01 84 60 00 00",
                "website": "https://exemple.fr",
                "iban": "FR76 3000 6000 0112 3456 7890 189",
                "bic": "AGRIFRPP",
            },
            commit=True,
        )

    # --- Team
    team_specs = [("Léa Martin", "lea.martin@exemple.fr", "manager", "Directrice commerciale", "#ff375f"), ("Hugo Bernard", "hugo.bernard@exemple.fr", "member", "Account Executive", "#30d158"), ("Inès Moreau", "ines.moreau@exemple.fr", "member", "Customer Success", "#ff9f0a"), ("Yanis Petit", "yanis.petit@exemple.fr", "member", "Lead développeur", "#64d2ff")]
    team = [admin]
    for name, email, role, title, color in team_specs:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            team.append(existing)
            continue
        u = User(name=name, email=email, role=role, title=title, color=color, password_hash=hash_password(f"Demo-{rng.randint(10**8, 10**9)}!x"), hourly_cost=rng.choice([45, 55, 65]))
        session.add(u)
        team.append(u)
    session.commit()
    sellers = team[:3]

    # --- Products
    products: dict[str, Product] = {}
    for name, sku, kind, category, price, unit, interval in PRODUCTS:
        p = Product(name=name, sku=sku, kind=kind, category=category, unit_price=price, unit=unit, recurring_interval=interval, vat_rate=20.0, description=None)
        session.add(p)
        products[sku] = p
    session.commit()

    # --- Companies & contacts
    companies: list[Company] = []
    contacts: list[Contact] = []
    used_names: set[str] = set()
    for i, (name, industry, city, domain, ctype, size) in enumerate(COMPANIES):
        created = _dt(t - timedelta(days=rng.randint(20, 540)))
        country = "Suisse" if city == "Genève" else "Luxembourg" if city == "Luxembourg" else "France"
        c = Company(
            name=name, industry=industry, city=city, country=country, domain=domain, website=f"https://{domain}", type=ctype, size=size,
            email=f"contact@{domain}", phone=f"0{rng.randint(1, 9)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}",
            address=f"{rng.randint(1, 120)} {rng.choice(['rue de la République', 'avenue Jean Jaurès', 'boulevard Haussmann', 'rue Nationale', 'quai des Chartrons', 'rue du Commerce'])}",
            zip=f"{rng.randint(10, 95):02d}{rng.randint(0, 999):03d}" if country == "France" else ("1201" if country == "Suisse" else "L-1855"),
            siren=_luhn_siren(rng) if country == "France" else None,
            vat_number=None,
            owner_id=rng.choice(sellers).id, source=rng.choice(SOURCES), health_score=rng.randint(45, 98), employees=rng.randint(5, 600),
            tags=rng.sample(["web3", "saas", "vip", "agence", "grand-compte", "startup", "early-adopter", "renouvellement"], k=rng.randint(0, 2)),
            created_at=created, updated_at=created,
            wallet_address=("0x" + "".join(rng.choice("0123456789abcdef") for _ in range(40))) if "Web3" in industry or "DAO" in industry or "NFT" in industry else None,
            chain=rng.choice(["Ethereum", "Solana", "Base", "Polygon"]) if "Web3" in industry or "DAO" in industry or "NFT" in industry else None,
        )
        if c.siren:
            key = (12 + 3 * (int(c.siren) % 97)) % 97
            c.vat_number = f"FR{key:02d}{c.siren}"
        session.add(c)
        companies.append(c)
    session.commit()

    for c in companies:
        for k in range(rng.randint(1, 4)):
            while True:
                first, last = rng.choice(FIRST), rng.choice(LAST)
                if (first, last) not in used_names:
                    used_names.add((first, last))
                    break
            email_local = _slug(f"{first}.{last}")
            lifecycle = "customer" if c.type == "client" else rng.choice(["lead", "mql", "sql", "opportunity"]) if c.type == "prospect" else "evangelist" if c.type == "partner" else "lead"
            created = c.created_at + timedelta(days=rng.randint(0, 30))
            ct = Contact(
                first_name=first, last_name=last, email=f"{email_local}@{c.domain}", phone=f"06 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}",
                job_title=TITLES[(k * 3 + rng.randint(0, 4)) % len(TITLES)], company_id=c.id, lifecycle=lifecycle, lead_score=rng.randint(20, 95), source=c.source,
                owner_id=c.owner_id, city=c.city, country=c.country, linkedin=f"https://www.linkedin.com/in/{email_local.replace('.', '-')}",
                tags=rng.sample(["décideur", "technique", "champion", "budget", "newsletter"], k=rng.randint(0, 2)),
                consent_marketing=rng.random() < 0.45, created_at=created, updated_at=created,
                last_contacted_at=_dt(t - timedelta(days=rng.randint(0, 60))),
            )
            if ct.consent_marketing:
                ct.consent_at = created
                ct.consent_source = "form:newsletter"
            contacts.append(ct)
            session.add(ct)
    # A few inbound leads without company
    for k in range(6):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        created = _dt(t - timedelta(days=rng.randint(0, 25)))
        ct = Contact(first_name=first, last_name=last, email=f"{_slug(f'{first}.{last}')}{k}@gmail.com", lifecycle="lead", lead_score=rng.randint(10, 60), source="Formulaire", owner_id=sellers[1].id, created_at=created, updated_at=created, tags=["inbound"])
        contacts.append(ct)
        session.add(ct)
    session.commit()

    by_company: dict[int, list[Contact]] = {}
    for ct in contacts:
        if ct.company_id:
            by_company.setdefault(ct.company_id, []).append(ct)

    # --- Deals
    pipelines = session.exec(select(Pipeline).order_by(Pipeline.position)).all()
    stages_by_pipeline = {p.id: session.exec(select(Stage).where(Stage.pipeline_id == p.id).order_by(Stage.position)).all() for p in pipelines}
    deal_titles = {
        "sales": ["Abonnement Business 25 sièges", "Migration vers Prisme Cloud", "Plan Enterprise groupe", "Extension 10 licences", "Pilote 3 mois", "Déploiement multi-sites", "Upgrade Pro → Business"],
        "services": ["Refonte de la plateforme client", "Développement app mobile", "Audit smart contract v2", "Intégration ERP", "Tokenomics & whitepaper", "Dashboard data temps réel", "Portail partenaires"],
        "partnership": ["Partenariat intégration wallet", "Co-marketing Web3", "Programme revendeur", "Bridge cross-chain"],
    }
    deals: list[Deal] = []
    used_titles: set[str] = set()
    for i in range(58):
        pipeline = pipelines[0] if i % 5 in (0, 1, 2) else pipelines[1] if i % 5 == 3 else pipelines[min(2, len(pipelines) - 1)]
        stages = stages_by_pipeline[pipeline.id]
        company = rng.choice(companies)
        roll = rng.random()
        if roll < 0.24:
            stage = next(s for s in stages if s.is_won)
        elif roll < 0.36:
            stage = next(s for s in stages if s.is_lost)
        else:
            stage = rng.choice([s for s in stages if not s.is_won and not s.is_lost])
        created = _dt(t - timedelta(days=rng.randint(5, 200)))
        recurring = pipeline.kind == "sales"
        mrr = float(rng.choice([149, 299, 499, 990, 1490, 2490, 4900])) if recurring else 0.0
        amount = float(rng.choice([1500, 3500, 6800, 9500, 14000, 22000, 38000, 54000])) if not recurring else float(rng.choice([0, 0, 1800, 3600]))
        closed = stage.is_won or stage.is_lost
        close_at = created + timedelta(days=rng.randint(10, 80))
        if close_at > _dt(t):
            close_at = _dt(t - timedelta(days=rng.randint(0, 10)))
        options = deal_titles[pipeline.kind if pipeline.kind in deal_titles else "sales"]
        title = f"{company.name} — {rng.choice(options)}"
        for option in rng.sample(options, k=len(options)):
            if title not in used_titles:
                break
            title = f"{company.name} — {option}"
        if title in used_titles:
            title = f"{title} (phase {sum(1 for x in used_titles if x.startswith(title)) + 1})"
        used_titles.add(title)
        d = Deal(
            title=title,
            pipeline_id=pipeline.id, stage_id=stage.id, company_id=company.id,
            contact_id=rng.choice(by_company.get(company.id, [None]) or [None]).id if by_company.get(company.id) else None,
            owner_id=rng.choice(sellers).id, amount=amount, mrr=mrr, status="won" if stage.is_won else "lost" if stage.is_lost else "open",
            expected_close_date=(t + timedelta(days=rng.randint(-15, 75))) if not closed else close_at.date(),
            closed_at=close_at if closed else None, lost_reason=rng.choice(["Prix trop élevé", "Concurrent retenu", "Projet reporté", "Pas de budget"]) if stage.is_lost else None,
            source=company.source, priority=rng.choice(["low", "medium", "medium", "high"]),
            next_step=None if closed else rng.choice(["Envoyer la proposition", "Démo avec l'équipe technique", "Appel de qualification", "Relancer le DAF", "Valider le budget", "Atelier de cadrage"]),
            next_step_date=None if closed else t + timedelta(days=rng.randint(-3, 14)),
            position=float(i), created_at=created, updated_at=created,
            stage_changed_at=close_at if closed else max(created, _dt(t - timedelta(days=rng.choice([1, 2, 4, 6, 9, 12, 16, 21, 28, 45])))),
            description="Opportunité identifiée lors d'un échange avec l'équipe dirigeante. Besoin de centraliser la relation client et la facturation.",
        )
        session.add(d)
        deals.append(d)
    session.commit()

    # --- Subscriptions with MRR history
    plans = [("Prisme Cloud — Starter", 49, "PLAN-STARTER"), ("Prisme Cloud — Pro", 149, "PLAN-PRO"), ("Prisme Cloud — Business", 499, "PLAN-BUSINESS"), ("Prisme Cloud — Enterprise", 1490, "PLAN-ENT"), ("Maintenance & support premium", 390, "SUP-PREMIUM")]
    clients = [c for c in companies if c.type == "client"]
    for c in clients:
        for _ in range(rng.choice([1, 1, 1, 2])):
            plan, price, sku = rng.choice(plans)
            qty = rng.choice([1, 2, 3, 5, 8]) if sku in ("PLAN-STARTER", "PLAN-PRO") else rng.choice([1, 1, 2]) if sku == "PLAN-BUSINESS" else 1
            start = t - timedelta(days=rng.randint(30, 520))
            interval = rng.choice(["month", "month", "month", "year"])
            amount = price * (10 if interval == "year" else 1)
            sub = Subscription(company_id=c.id, contact_id=(by_company.get(c.id) or [None])[0].id if by_company.get(c.id) else None, product_id=products[sku].id, plan=plan, amount=amount, quantity=qty, interval=interval, start_date=start, status="active", owner_id=c.owner_id)
            months_period = 12 if interval == "year" else 1
            elapsed = (t - start).days // 30
            sub.current_period_end = start + timedelta(days=30 * months_period * (elapsed // months_period + 1))
            r = rng.random()
            if r >= 0.37 and r < 0.45:
                sub.status = "trialing"
                sub.start_date = t - timedelta(days=rng.randint(2, 10))
                sub.trial_end = t + timedelta(days=rng.randint(3, 14))
                session.add(sub)
                continue
            session.add(sub)
            session.flush()
            mrr0 = sub.mrr
            session.add(SubscriptionChange(subscription_id=sub.id, company_id=c.id, date=start, kind="new", mrr_delta=mrr0, mrr_after=mrr0))
            if r < 0.28 and elapsed > 3:
                when = start + timedelta(days=rng.randint(60, max(61, (t - start).days - 5)))
                old = sub.mrr
                sub.quantity += rng.choice([1, 2, 5])
                session.add(SubscriptionChange(subscription_id=sub.id, company_id=c.id, date=when, kind="expansion", mrr_delta=round(sub.mrr - old, 2), mrr_after=sub.mrr))
            elif 0.28 <= r < 0.33 and elapsed > 4:
                # Recent churn, so the MRR movements chart has something to show.
                lo = max(45, (t - start).days - 240)
                when = start + timedelta(days=rng.randint(lo, max(lo + 1, (t - start).days - 3)))
                session.add(SubscriptionChange(subscription_id=sub.id, company_id=c.id, date=when, kind="churn", mrr_delta=-sub.mrr, mrr_after=0))
                sub.status = "canceled"
                sub.canceled_at = when
                sub.cancel_reason = rng.choice(["Budget", "Changement d'outil", "Fusion / rachat"])
            elif 0.33 <= r < 0.37 and elapsed > 3:
                lo = max(45, (t - start).days - 240)
                when = start + timedelta(days=rng.randint(lo, max(lo + 1, (t - start).days - 3)))
                old = sub.mrr
                if sub.quantity > 1:
                    sub.quantity = max(1, sub.quantity - rng.choice([1, 2]))
                else:
                    sub.discount = 20
                if round(sub.mrr - old, 2) < 0:
                    session.add(SubscriptionChange(subscription_id=sub.id, company_id=c.id, date=when, kind="contraction", mrr_delta=round(sub.mrr - old, 2), mrr_after=sub.mrr))
            session.add(sub)
    session.commit()

    # --- Quotes
    quote_lines_catalog = [
        [("DEV-JOUR", 8), ("DESIGN-JOUR", 3), ("FORMATION", 1)],
        [("WEB3-AUDIT", 1), ("CONSEIL", 2)],
        [("INT-API", 24), ("DEV-JOUR", 4)],
        [("WEB3-TOKEN", 1), ("CONSEIL", 1)],
        [("LIC-ONPREM", 1), ("FORMATION", 2), ("SUP-PREMIUM", 12)],
    ]
    for i in range(16):
        company = rng.choice(companies)
        lines = [{"type": "section", "description": "Prestations"}]
        for sku, qty in rng.choice(quote_lines_catalog):
            p = products[sku]
            lines.append({"product_id": p.id, "description": p.name, "quantity": qty, "unit": p.unit, "unit_price": p.unit_price, "vat_rate": 20.0})
        status = rng.choice(["draft", "sent", "sent", "viewed", "accepted", "accepted", "declined"])
        issue = t - timedelta(days=rng.randint(1, 70))
        q = Quote(title=rng.choice(["Refonte plateforme", "Audit sécurité Web3", "Intégration API", "Lancement token", "Déploiement on-premise"]), company_id=company.id, contact_id=(by_company.get(company.id) or [None])[0].id if by_company.get(company.id) else None, owner_id=rng.choice(sellers).id, issue_date=issue, lines=lines, discount=rng.choice([0, 0, 5, 10]), status=status, deposit_percent=rng.choice([None, 30]))
        invoicing.quote_defaults(session, q)
        invoicing.apply_totals(session, q)
        q.valid_until = issue + timedelta(days=30)
        if status != "draft":
            q.sent_at = _dt(issue, 11)
            q.seller = invoicing.seller_snapshot(session)
            q.buyer = invoicing.buyer_snapshot(session, q.company_id, q.contact_id)
        if status == "accepted":
            q.accepted_at = _dt(issue + timedelta(days=rng.randint(1, 9)), 15)
            contact = session.get(Contact, q.contact_id) if q.contact_id else None
            q.signed_by = contact.full_name if contact else "Client"
            q.signer_email = contact.email if contact else None
            q.signature_hash = "démo"
        session.add(q)
    session.commit()

    # --- Invoices (issued chronologically, integrity chain)
    seller = invoicing.seller_snapshot(session)
    billing = get_section(session, "billing")
    invoice_dates = sorted(t - timedelta(days=rng.randint(2, 360)) for _ in range(64))
    prev_hash = invoicing.last_hash(session)
    seq_by_year: dict[int, int] = {}
    for index, d in enumerate(invoice_dates):
        company = rng.choice([c for c in companies if c.type in ("client", "partner")])
        lines = []
        for sku, qty in rng.choice(quote_lines_catalog)[: rng.randint(1, 3)]:
            p = products[sku]
            lines.append({"product_id": p.id, "description": p.name, "quantity": qty, "unit": p.unit, "unit_price": p.unit_price, "vat_rate": 20.0})
        inv = Invoice(title=rng.choice(["Prestations du mois", "Développement — lot 2", "Audit et recommandations", "Abonnement et services", "Formation des équipes"]), company_id=company.id, contact_id=(by_company.get(company.id) or [None])[0].id if by_company.get(company.id) else None, owner_id=rng.choice(sellers).id, issue_date=d, lines=lines, discount=rng.choice([0, 0, 0, 5]), nature="services", service_date=d)
        invoicing.apply_totals(session, inv)
        invoicing.invoice_defaults(session, inv)
        inv.issue_date = d
        inv.due_date = d + timedelta(days=int(billing["payment_days"]))
        seq_by_year[d.year] = seq_by_year.get(d.year, 0) + 1
        inv.sequence = seq_by_year[d.year]
        inv.number = f"{billing['invoice_prefix']}-{d.year}-{inv.sequence:05d}"
        inv.seller = seller
        inv.buyer = invoicing.buyer_snapshot(session, inv.company_id, inv.contact_id)
        inv.issued_at = _dt(d, 8) + timedelta(minutes=index)  # strictly chronological issue order
        inv.locked = True
        inv.sent_at = _dt(d, 10)
        inv.einvoice_format = "factur-x"
        inv.prev_hash = prev_hash
        inv.hash = invoicing.chain_hash(prev_hash, inv)
        prev_hash = inv.hash
        inv.status = "sent"
        session.add(inv)
        session.flush()
        age = (t - inv.due_date).days
        roll = rng.random()
        if age > 0 and roll < 0.86 or age <= 0 and roll < 0.3:
            pay_date = min(inv.due_date + timedelta(days=rng.randint(-20, 12)), t)
            session.add(Payment(invoice_id=inv.id, amount=inv.total, date=max(pay_date, d), method=rng.choice(["transfer", "transfer", "card", "crypto"]), reference=f"VIR {inv.number}"))
            inv.amount_paid = inv.total
            inv.status = "paid"
            inv.paid_at = _dt(max(pay_date, d), 14)
        elif roll < 0.92 and age > 0:
            part = round(inv.total * 0.4, 2)
            session.add(Payment(invoice_id=inv.id, amount=part, date=inv.due_date, method="transfer", reference=f"VIR {inv.number}"))
            inv.amount_paid = part
            inv.status = "partial"
        elif age > 0:
            inv.status = "overdue"
        session.add(inv)
    session.commit()

    # One draft invoice ready to issue
    draft_company = clients[0] if clients else companies[0]
    draft = Invoice(title="Développement — sprint 4", company_id=draft_company.id, contact_id=(by_company.get(draft_company.id) or [None])[0].id if by_company.get(draft_company.id) else None, owner_id=admin.id, lines=[{"product_id": products["DEV-JOUR"].id, "description": "Développement sur mesure", "quantity": 6, "unit": "jour", "unit_price": 650, "vat_rate": 20}], nature="services")
    invoicing.apply_totals(session, draft)
    invoicing.invoice_defaults(session, draft)
    session.add(draft)
    session.commit()

    # --- Projects, tasks, time
    project_specs = [
        ("Refonte plateforme NovaPay", "NovaPay", "time", 38000, 320, 95, "#5b6cff"),
        ("Audit smart contracts Solaris", "Solaris Labs", "fixed", 9000, 60, 0, "#30d5c8"),
        ("App mobile Kairos", "Kairos RH", "fixed", 42000, 380, 0, "#bf5af2"),
        ("Data platform Orbital", "Orbital Data", "time", 26000, 240, 110, "#ff9f0a"),
        ("Portail partenaires Helios", "Helios Énergie", "fixed", 18500, 160, 0, "#30d158"),
        ("Wallet & bridge Hyperion", "Hyperion Games", "time", 31000, 260, 105, "#ff375f"),
        ("Infogérance BlockHarbor", "BlockHarbor", "retainer", 4800, 40, 95, "#64d2ff"),
    ]
    task_titles = ["Atelier de cadrage", "Maquettes UX", "Architecture technique", "Mise en place CI/CD", "Développement API", "Tests d'intégration", "Revue de sécurité", "Recette client", "Mise en production", "Documentation", "Formation utilisateurs", "Optimisation performances", "Migration des données", "Tableau de bord KPI"]
    projects: list[Project] = []
    for idx, (name, cname, mode, budget, hours, rate, color) in enumerate(project_specs):
        company = next((c for c in companies if c.name == cname), companies[0])
        start = t - timedelta(days=rng.randint(20, 110))
        p = Project(name=name, code=f"PRJ-{idx + 1:03d}", company_id=company.id, status=rng.choice(["active", "active", "active", "on_hold", "planned"]), health=rng.choice(["on_track", "on_track", "at_risk"]), billing_mode=mode, budget_amount=budget, budget_hours=hours, hourly_rate=rate or 95, start_date=start, due_date=start + timedelta(days=rng.randint(60, 160)), owner_id=rng.choice(team).id, color=color, description="Projet de delivery suivi en mode agile (sprints de 2 semaines).", created_at=_dt(start), updated_at=_dt(start))
        session.add(p)
        projects.append(p)
    session.commit()
    for p in projects:
        for k, title in enumerate(rng.sample(task_titles, k=rng.randint(6, 10))):
            status = rng.choice(["todo", "todo", "in_progress", "review", "done", "done", "done"])
            session.add(Task(title=title, project_id=p.id, company_id=p.company_id, status=status, priority=rng.choice(["low", "medium", "medium", "high", "urgent"]), assignee_id=rng.choice(team).id, due_date=t + timedelta(days=rng.randint(-10, 30)), estimate_hours=rng.choice([2, 4, 8, 16]), position=float(k), completed_at=utcnow() - timedelta(days=rng.randint(1, 30)) if status == "done" else None))
        for _ in range(rng.randint(18, 40)):
            d = t - timedelta(days=rng.randint(0, 75))
            if d.weekday() >= 5:
                continue
            session.add(TimeEntry(user_id=rng.choice(team).id, project_id=p.id, company_id=p.company_id, date=d, minutes=rng.choice([60, 90, 120, 180, 240, 300, 420]), description=rng.choice(["Développement", "Réunion client", "Revue de code", "Tests", "Design", "Support"]), billable=rng.random() < 0.85, hourly_rate=p.hourly_rate))
    # Personal / sales tasks
    for k in range(18):
        ct = rng.choice(contacts)
        session.add(Task(title=rng.choice(["Rappeler", "Envoyer la proposition à", "Préparer la démo pour", "Relancer", "Planifier un point avec"]) + f" {ct.full_name}", type=rng.choice(["call", "email", "follow_up", "meeting"]), status=rng.choice(["todo", "todo", "in_progress", "done"]), priority=rng.choice(["medium", "high", "low"]), assignee_id=rng.choice([admin.id, admin.id, sellers[1].id]), contact_id=ct.id, company_id=ct.company_id, due_date=t + timedelta(days=rng.randint(-4, 10)), position=float(100 + k)))
    session.commit()

    # --- Calendar
    for k in range(26):
        day = t + timedelta(days=rng.randint(-10, 18))
        if day.weekday() >= 5:
            day += timedelta(days=2)
        hour = rng.choice([9, 10, 11, 14, 15, 16, 17])
        ct = rng.choice(contacts)
        kind = rng.choice(["meeting", "call", "demo", "meeting", "focus"])
        start = datetime.combine(day, time(hour, rng.choice([0, 30])), tzinfo=timezone.utc) - timedelta(hours=2)
        title = {"meeting": f"Rendez-vous — {ct.full_name}", "call": f"Appel — {ct.full_name}", "demo": f"Démo produit — {ct.full_name}", "focus": "Bloc focus : propositions"}[kind]
        session.add(Event(title=title, type=kind, start_at=start, end_at=start + timedelta(minutes=rng.choice([30, 45, 60, 90])), user_id=rng.choice(team).id, contact_id=ct.id if kind != "focus" else None, company_id=ct.company_id if kind != "focus" else None, meeting_url="https://meet.exemple.fr/prisme-" + str(k) if kind in ("call", "demo") else None, location="Visio" if kind in ("call", "demo") else rng.choice(["Bureau Paris", "Chez le client", None])))
    session.commit()

    # --- Activities
    act_subjects = {
        "call": ["Appel de découverte", "Point d'avancement", "Qualification budget", "Relance téléphonique"],
        "email": ["Envoi de la documentation", "Réponse aux questions techniques", "Proposition commerciale", "Compte rendu de réunion"],
        "meeting": ["Démo produit", "Atelier de cadrage", "Comité de pilotage", "Déjeuner d'affaires"],
        "note": ["Besoin : centraliser la facturation", "Décideur final : le DAF", "Sensible à la conformité RGPD", "Intéressé par l'intégration Web3"],
    }
    for _ in range(190):
        ct = rng.choice(contacts)
        kind = rng.choice(["call", "email", "meeting", "note", "email", "call"])
        when = utcnow() - timedelta(days=rng.randint(0, 120), hours=rng.randint(0, 9))
        deal = rng.choice([d for d in deals if d.company_id == ct.company_id] or [None])
        session.add(Activity(type=kind, subject=rng.choice(act_subjects[kind]), body=rng.choice(["Échange constructif, intérêt confirmé.", "Le client souhaite une proposition sous 10 jours.", "Points de vigilance : délais et intégration au SI existant.", "Très bon feeling, prochaine étape : démo technique.", None]), contact_id=ct.id, company_id=ct.company_id, deal_id=deal.id if deal else None, user_id=rng.choice(team).id, occurred_at=when, duration_minutes=rng.choice([15, 30, 45, 60]) if kind in ("call", "meeting") else None, outcome=rng.choice(["Joint", "Messagerie", "Pas de réponse"]) if kind == "call" else None, direction="out" if kind in ("call", "email") else None))
    session.commit()

    # --- Support
    ticket_subjects = ["Impossible d'exporter les factures en PDF", "Question sur la facturation électronique", "Erreur 500 sur l'API contacts", "Ajout d'utilisateurs supplémentaires", "Synchronisation du wallet échouée", "Demande de remboursement", "Comment configurer le SSO ?", "Lenteurs sur le tableau de bord", "Bug d'affichage sur mobile", "Changement d'adresse de facturation"]
    for k in range(22):
        ct = rng.choice([c for c in contacts if c.company_id])
        status = rng.choice(["open", "pending", "resolved", "closed", "new", "open", "resolved"])
        created = utcnow() - (timedelta(hours=rng.randint(1, 30)) if status in ("open", "new", "pending") else timedelta(days=rng.randint(2, 45), hours=rng.randint(0, 20)))
        tk = Ticket(number=f"TCK-{k + 1:05d}", subject=rng.choice(ticket_subjects), description="Bonjour, nous rencontrons un problème depuis ce matin. Pouvez-vous nous aider rapidement ? Merci !", status=status, priority=rng.choice(["low", "normal", "normal", "high", "urgent"]), channel=rng.choice(["email", "chat", "portal", "phone"]), category=rng.choice(["Facturation", "Technique", "Compte", "Web3"]), company_id=ct.company_id, contact_id=ct.id, assignee_id=team[3 if len(team) > 3 else 0].id if rng.random() < 0.7 else None, created_at=created, updated_at=created)
        tk.sla_due_at = created + timedelta(hours={"urgent": 4, "high": 8, "normal": 24, "low": 72}[tk.priority])
        if status in ("resolved", "closed"):
            tk.first_response_at = created + timedelta(hours=rng.randint(1, 6))
            tk.resolved_at = created + timedelta(hours=rng.randint(6, 60))
            tk.satisfaction = rng.choice([4, 5, 5, 3, 5])
        elif status == "pending":
            tk.first_response_at = created + timedelta(hours=rng.randint(1, 5))
        session.add(tk)
        session.flush()
        session.add(TicketMessage(ticket_id=tk.id, author_type="customer", author_name=ct.full_name, body=tk.description or "", created_at=created))
        if tk.first_response_at:
            session.add(TicketMessage(ticket_id=tk.id, author_type="agent", author_name=team[3 if len(team) > 3 else 0].name, user_id=team[3 if len(team) > 3 else 0].id, body="Bonjour, merci pour votre message. Nous analysons la situation et revenons vers vous très rapidement.", created_at=tk.first_response_at))
    session.commit()

    kb = [
        ("Émettre une facture conforme", "Facturation", "Les étapes pour émettre une facture avec toutes les mentions obligatoires."),
        ("Comprendre la facturation électronique 2026-2027", "Facturation", "Calendrier de la réforme, Factur-X et plateformes agréées."),
        ("Corriger une facture avec un avoir", "Facturation", "Pourquoi une facture émise ne se modifie pas et comment émettre un avoir."),
        ("Connecter Claude à votre CRM (MCP)", "Intégrations", "Utiliser votre abonnement Claude pour piloter le CRM."),
        ("Inviter votre équipe et gérer les rôles", "Compte", "Administrateur, manager, membre, lecteur."),
        ("Importer vos contacts depuis un fichier CSV", "Données", "Correspondance des colonnes et dédoublonnage."),
        ("Exercer les droits RGPD d'un contact", "Conformité", "Export, anonymisation et registre des consentements."),
    ]
    for title, category, summary in kb:
        session.add(KbArticle(title=title, slug=title.lower().replace(" ", "-").replace("'", "")[:60], category=category, summary=summary, body=f"# {title}\n\n{summary}\n\n## Étapes\n\n1. Ouvrez le module concerné.\n2. Suivez l'assistant.\n3. Vérifiez le résultat.\n\n> Astuce : l'assistant IA peut le faire pour vous.", status="published", views=rng.randint(10, 400), author_id=admin.id))
    session.commit()

    # --- Marketing
    seg_web3 = Segment(name="Décideurs Web3", description="Contacts des entreprises Web3 avec un poste de direction", entity="contacts", rules={"match": "all", "conditions": [{"field": "company.industry", "op": "contains", "value": "Web3"}]}, color="#30d5c8")
    seg_clients = Segment(name="Clients actifs", entity="contacts", rules={"match": "all", "conditions": [{"field": "lifecycle", "op": "eq", "value": "customer"}]}, color="#30d158")
    seg_leads = Segment(name="Leads chauds", entity="contacts", rules={"match": "all", "conditions": [{"field": "lead_score", "op": "gte", "value": 70}, {"field": "lifecycle", "op": "in", "value": "lead,mql,sql"}]}, color="#ff9f0a")
    seg_news = Segment(name="Abonnés newsletter", entity="contacts", rules={"match": "all", "conditions": [{"field": "consent_marketing", "op": "is_true"}]}, color="#5b6cff")
    for s in (seg_web3, seg_clients, seg_leads, seg_news):
        session.add(s)
    session.commit()
    session.add(Campaign(name="Newsletter d'octobre", status="sent", segment_id=seg_news.id, subject="Les nouveautés d'octobre 🍂", body="Bonjour {{contact.first_name}},\n\nDécouvrez nos nouveautés du mois : facturation électronique Factur-X, assistant IA et nouveaux rapports.", sent_at=utcnow() - timedelta(days=9), owner_id=admin.id, stats={"recipients": 41, "sent": 41, "failed": 0, "excluded": 12}))
    session.add(Campaign(name="Webinar facturation électronique", status="sent", segment_id=seg_clients.id, subject="Êtes-vous prêt pour septembre 2027 ?", body="Bonjour {{contact.first_name}},\n\nInscrivez-vous à notre webinar sur la facturation électronique.", sent_at=utcnow() - timedelta(days=30), owner_id=admin.id, stats={"recipients": 37, "sent": 36, "failed": 1, "excluded": 4}))
    session.add(Campaign(name="Offre spéciale Web3", status="draft", segment_id=seg_web3.id, subject="{{contact.first_name}}, auditez vos smart contracts", body="Bonjour {{contact.first_name}},\n\nCe trimestre, profitez d'un audit de smart contract accompagné de recommandations détaillées.", owner_id=admin.id))
    session.add(Form(name="Demande de démo", slug="demande-de-demo", title="Demandez votre démo personnalisée", description="Un expert vous rappelle sous 24 h.", fields=[{"name": "first_name", "label": "Prénom", "type": "text", "required": True, "map_to": "first_name"}, {"name": "last_name", "label": "Nom", "type": "text", "required": True, "map_to": "last_name"}, {"name": "email", "label": "Email professionnel", "type": "email", "required": True, "map_to": "email"}, {"name": "company", "label": "Entreprise", "type": "text", "required": True, "map_to": "company"}, {"name": "team_size", "label": "Taille de l'équipe", "type": "select", "options": ["1-10", "11-50", "51-200", "200+"], "required": False}, {"name": "message", "label": "Votre besoin", "type": "textarea", "required": False}], lifecycle="mql", tags_to_add=["demande-demo"], owner_id=sellers[1].id, create_deal=True, pipeline_id=pipelines[0].id, submissions=27))
    session.add(Form(name="Newsletter", slug="newsletter", title="Recevez nos actualités", fields=[{"name": "email", "label": "Email", "type": "email", "required": True, "map_to": "email"}, {"name": "first_name", "label": "Prénom", "type": "text", "required": False, "map_to": "first_name"}], lifecycle="lead", tags_to_add=["newsletter"], submissions=143))

    # --- Automations (examples)
    session.add(Automation(name="Nouveau lead → tâche d'appel sous 24 h", description="Chaque lead entrant via formulaire est rappelé dans la journée.", trigger={"type": "form.submitted", "config": {}}, actions=[{"type": "create_task", "config": {"title": "Appeler {{contact.full_name}} (lead entrant)", "due_in_days": 1, "priority": "high", "assignee": "owner"}}, {"type": "notify", "config": {"target": "owner", "title": "Nouveau lead : {{contact.full_name}}"}}], owner_id=admin.id))
    session.add(Automation(name="Affaire gagnée → projet + onboarding", description="Crée le projet de delivery et la tâche d'onboarding.", trigger={"type": "deal.won", "config": {}}, actions=[{"type": "create_project", "config": {"name": "Onboarding — {{company.name}}", "billing_mode": "fixed"}}, {"type": "create_task", "config": {"title": "Kick-off avec {{company.name}}", "due_in_days": 3, "priority": "high", "assignee": "owner"}}], owner_id=admin.id))
    session.add(Automation(name="Facture en retard → relance interne", trigger={"type": "invoice.overdue", "config": {}}, actions=[{"type": "create_task", "config": {"title": "Relancer le paiement de la facture {{entity.number}}", "due_in_days": 0, "priority": "high", "assignee": "owner"}}], owner_id=admin.id))
    session.add(Automation(name="Devis signé → facture d'acompte (IA)", description="L'agent IA prépare la facture d'acompte et prévient l'équipe.", active=False, trigger={"type": "quote.accepted", "config": {}}, actions=[{"type": "ai_agent", "config": {"instructions": "Le devis {{entity.number}} vient d'être signé. Crée une facture d'acompte brouillon de 30 % si le devis prévoit un acompte, puis crée une tâche pour planifier le kick-off."}}], owner_id=admin.id))
    session.add(Automation(name="Ticket urgent → alerte équipe", trigger={"type": "ticket.created", "config": {}}, conditions=[{"field": "entity.priority", "op": "eq", "value": "urgent"}], actions=[{"type": "notify", "config": {"target": "all", "title": "🚨 Ticket urgent : {{entity.subject}}"}}], owner_id=admin.id))
    session.add(Notification(user_id=admin.id, type="success", title="Bienvenue dans Prisme 👋", body="Les données de démonstration sont chargées. Explorez le tableau de bord ou demandez à l'assistant IA !", link="/"))
    session.commit()
