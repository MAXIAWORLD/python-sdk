"""Offline free-text request -> spec (0 tokens). Lexicon families + noun extraction + relation inference.

Good enough for CRUD business apps; SWF_LLM=1 gives a tailored spec instead.
"""

from __future__ import annotations

import re
import unicodedata

FAMILIES: dict[str, set[str]] = {
    "person": {
        "client", "contact", "prospect", "eleve", "etudiant", "patient", "employe", "salarie", "membre", "utilisateur",
        "adherent", "candidat", "professeur", "enseignant", "formateur", "fournisseur", "benevole", "locataire",
        "proprietaire", "chauffeur", "conducteur", "livreur", "driver", "medecin", "intervenant", "technicien", "commercial", "partenaire", "parent", "joueur", "coach",
        "customer", "user", "member", "student", "teacher", "employee", "supplier", "vendor", "tenant", "doctor", "player",
    },
    "money": {
        "facture", "devis", "commande", "paiement", "contrat", "vente", "opportunite", "abonnement", "depense", "note_de_frais",
        "don", "cotisation", "remboursement", "invoice", "order", "payment", "quote", "deal", "subscription", "expense", "donation",
    },
    "event": {
        "rendez_vous", "rdv", "reunion", "cours", "seance", "reservation", "intervention", "evenement", "tache", "mission",
        "projet", "atelier", "formation", "visite", "match", "entrainement", "consultation", "examen", "ticket", "demande",
        "appointment", "meeting", "booking", "event", "task", "project", "session", "lesson", "visit",
    },
    "item": {
        "produit", "article", "materiel", "equipement", "vehicule", "livre", "bien", "logement", "chambre", "salle", "stock",
        "lot", "piece", "outil", "document", "product", "item", "vehicle", "book", "room", "asset", "equipment", "property",
    },
    "org": {"entreprise", "societe", "ecole", "classe", "association", "agence", "magasin", "site", "equipe", "company", "school", "team", "store"},
}
FIELDS = {
    "person": [("name", "str", True), ("email", "email", False), ("phone", "str", False)],
    "org": [("name", "str", True), ("city", "str", False), ("phone", "str", False)],
    "money": [("reference", "str", True), ("amount", "float", False), ("date", "date", False)],
    "event": [("title", "str", True), ("starts_at", "datetime", False), ("duration_min", "int", False)],
    "item": [("name", "str", True), ("reference", "str", False), ("price", "float", False), ("quantity", "int", False)],
    "other": [("name", "str", True), ("description", "text", False)],
}
STATUS = {
    "person": ["actif", "inactif"],
    "money": ["brouillon", "envoyé", "payé", "annulé"],
    "event": ["prévu", "en cours", "terminé", "annulé"],
    "item": ["disponible", "indisponible"],
}
STOP = {
    "application", "logiciel", "outil", "systeme", "gestion", "plateforme", "app", "crm", "erp", "base", "donnees", "suivi", "liste",
    "leurs", "leur", "mes", "nos", "vos", "ses", "chaque", "tous", "toutes", "avec", "pour", "dans", "entre", "aussi", "plus",
    "statut", "status", "date", "dates", "email", "emails", "telephone", "adresse", "note", "notes", "montant", "prix", "nom", "noms",
    "the", "and", "with", "for", "their", "manage", "track", "small", "petite", "petit", "simple", "complet", "complete",
}
INVARIANT = {"cours", "prix", "bus", "fils", "rdv", "rendez_vous", "status", "process"}


def _norm(word: str) -> str:
    w = unicodedata.normalize("NFKD", word.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9_]", "", w)


def _singular(w: str) -> str:
    if w in INVARIANT or len(w) <= 3:
        return w
    if w.endswith("aux"):
        return w[:-3] + "al"
    if w.endswith(("s", "x")):
        return w[:-1]
    return w


def family(w: str) -> str:
    return next((f for f, words in FAMILIES.items() if w in words), "other")


def extract(request: str) -> list[tuple[str, str, str]]:
    """-> [(ident, label, family)] in order of appearance."""
    text = request.lower().replace("rendez-vous", "rendez_vous").replace("notes de frais", "note_de_frais")
    words = re.findall(r"[\wÀ-ÿ'-]+", text)
    out: dict[str, tuple[str, str, str]] = {}
    for i, raw in enumerate(words):
        raw = raw.split("'")[-1]
        ident = _singular(_norm(raw))
        if not ident or ident in STOP or ident in out:
            continue
        fam = family(ident)
        prev = _norm(words[i - 1].split("'")[-1]) if i else ""
        after_article = prev in {"des", "les", "aux", "du", "de", "the", "of", "et", "and"} or words[i - 1].endswith(",") if i else False
        if fam != "other" or (after_article and len(ident) >= 5 and raw.endswith(("s", "x"))):
            label = raw.replace("_", " ")
            plural = label if label.endswith(("s", "x")) else label[:-1] + "ies" if label.endswith("y") else label + "s"
            out[ident] = (ident, plural[:1].upper() + plural[1:], fam)
    return list(out.values())[:6]


def compose(request: str) -> dict | None:
    ents = extract(request)
    if not ents:
        return None
    text = _norm(request.replace(" ", "_"))
    want_status = any(k in text for k in ("statut", "status", "etat", "suivi", "pipeline"))
    want_notes = any(k in text for k in ("note", "commentaire", "comment"))
    spec_ents = []
    for idx, (ident, label, fam) in enumerate(ents):
        fields = [{"name": n, "type": t, **({"required": True} if r else {})} for n, t, r in FIELDS[fam]]
        if fam in STATUS and (want_status or fam in ("money", "event")):
            fields.append({"name": "status", "type": "enum", "values": STATUS[fam], "default": STATUS[fam][0]})
        if want_notes:
            fields.append({"name": "notes", "type": "text"})
        # relations: link to the nearest earlier entity of each "parent" family (org > person > item)
        parents = {"person": ["org"], "money": ["person", "org", "item"], "event": ["person", "org", "item"], "item": ["org"], "other": ["org", "person"]}
        for pf in parents.get(fam, []):
            earlier = ents[:idx] if fam == "money" else list(reversed(ents[:idx]))  # payer = first person cited
            target = next((e for e in earlier if e[2] == pf), None) or next((e for e in ents[idx + 1 :] if e[2] == pf and fam != "person"), None)
            if target and target[0] != ident:
                fields.append({"name": f"{target[0]}_id", "type": "ref", "ref": target[0]})
        spec_ents.append({"name": ident, "label": label, "fields": fields})
    name = "gestion-" + ents[0][0].replace("_", "-")
    return {"name": name[:40].strip("-"), "title": "Gestion des " + ", ".join(e[1].lower() for e in ents), "entities": spec_ents}
