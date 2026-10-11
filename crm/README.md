# Prisme — CRM tout-en-un avec IA

Prisme est un logiciel de gestion complet pour une entreprise française (tech, SaaS, Web3, agence, conseil) :
relation client, ventes, **facturation conforme**, abonnements, projets, temps passé, support, marketing,
automatisations et une **assistante IA (Iris)** capable d'agir dans le CRM. L'interface « Liquid Glass »
(verre translucide, reflets, profondeur, scène 3D) fonctionne en clair et en sombre, sur ordinateur et mobile,
et s'installe comme une application (PWA).

Vous pouvez y brancher **n'importe quel LLM** (Claude, OpenAI, Mistral, Gemini, Groq, OpenRouter, DeepSeek, xAI,
Ollama ou LM Studio en local…) et/ou **votre abonnement Claude** : Claude Desktop et Claude Code pilotent Prisme
via le protocole **MCP**.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Démarrage rapide](#démarrage-rapide)
3. [Connecter une IA](#connecter-une-ia)
4. [Utiliser votre abonnement Claude (MCP)](#utiliser-votre-abonnement-claude-mcp)
5. [Conformité française](#conformité-française)
6. [Configuration](#configuration)
7. [Données, sauvegardes et sécurité](#données-sauvegardes-et-sécurité)
8. [Architecture et développement](#architecture-et-développement)

---

## Fonctionnalités

| Domaine | Ce que vous pouvez faire |
| --- | --- |
| **Pilotage** | Tableau de bord temps réel (CA, encaissements, MRR/ARR, pipeline pondéré, créances, leads, tickets), brief du jour rédigé par l'IA, rapports (ventes, revenus récurrents, trésorerie, activité, support, temps). |
| **Relation client** | Contacts et entreprises (vues tableau/cartes, filtres, actions groupées, import/export CSV), fiches à 360° avec chronologie (notes, appels, réunions, emails), score de lead et qualification BANT par l'IA, consentements RGPD. |
| **Ventes** | Pipelines Kanban en glisser-déposer, valeurs pondérées, alertes d'inactivité, motifs de perte, coach commercial IA, devis avec signature électronique en ligne, conversion devis → facture / acompte. |
| **Facturation** | Factures, acomptes et avoirs conformes (mentions obligatoires, numérotation continue, verrouillage, chaînage d'intégrité), PDF/A-3 **Factur-X**, paiements (virement, carte, prélèvement, crypto…), relances, export **FEC**. |
| **Abonnements (SaaS)** | MRR, ARR, NRR, churn, mouvements (nouveau, expansion, contraction, churn), renouvellements, essais, génération des factures récurrentes. |
| **Delivery** | Projets (budget, rentabilité, santé), tâches (focus du jour, Kanban, checklists), minuteur et feuilles de temps, facturation du temps passé, agenda (mois, semaine, liste) avec abonnement ICS. |
| **Support** | Tickets avec SLA, notes internes, réponses suggérées par l'IA, base de connaissances et centre d'aide public. |
| **Marketing** | Segments dynamiques, campagnes email (audience filtrée par consentement, test, programmation, statistiques), formulaires de capture de leads intégrables, désinscription en un clic. |
| **Communication** | Boîte mail intégrée (SMTP/IMAP), modèles d'emails, rédaction assistée, documents liés aux fiches. |
| **Automatisations** | 22 déclencheurs (création, changement d’étape, devis consulté, facture en retard, planification quotidienne…), conditions et actions (email, tâche, notification, mise à jour, webhook, **agent IA**…), historique des exécutions. |
| **IA** | Assistante Iris dans toute l'application (chat, actions ✨), 19 outils pour lire et agir dans le CRM avec **validation humaine** des actions d'écriture, pseudonymisation optionnelle des données personnelles envoyées au modèle. |

---

## Démarrage rapide

### Option 1 — Docker (recommandé pour un serveur)

```bash
cd crm
docker compose up -d
# puis ouvrez http://localhost:8000
```

Les données sont conservées dans le volume `prisme-data`. Pour un accès depuis Internet, placez Prisme derrière un
reverse proxy HTTPS (Caddy, Traefik, Nginx) et définissez `PRISME_PUBLIC_URL` (ex. `https://crm.mon-entreprise.fr`)
pour que les liens envoyés par email (signature de devis, factures, formulaires) soient corrects.

### Option 2 — Sur votre ordinateur (Windows, macOS, Linux)

Prérequis : [uv](https://docs.astral.sh/uv/) (gestionnaire Python) et [Node.js 20+](https://nodejs.org) (pour
construire l'interface la première fois).

```bash
cd crm
./start.sh            # Linux / macOS
start.bat             # Windows (double-clic) — ou .\start.ps1 dans PowerShell
```

Le script construit l'interface si nécessaire puis démarre le serveur sur http://localhost:8000.
Options : `./start.sh --build` (reconstruire l'interface), `./start.sh --host 0.0.0.0 --port 9000`.

### Premier lancement

L'assistant d'installation vous demande le nom de votre entreprise et crée le compte administrateur
(mot de passe de 12 caractères minimum, conformément aux recommandations de la CNIL). Vous pouvez charger des
**données de démonstration** pour explorer toutes les fonctionnalités.

Ensuite, dans **Paramètres** :

1. **Entreprise** : raison sociale, forme juridique, capital, adresse, SIREN/SIRET, TVA intracommunautaire, RCS,
   IBAN — indispensables avant d'émettre votre première facture.
2. **Facturation** : délais de paiement, pénalités de retard, préfixes de numérotation, e-facturation.
3. **Email** : serveur SMTP (envoi) et IMAP (synchronisation de la boîte mail).
4. **Intelligence artificielle** et/ou **Claude (MCP)** : voir ci-dessous.

Ligne de commande utile : `uv run --project backend prisme --help` (`serve`, `mcp`, `create-admin`, `demo`, `info`).

---

## Connecter une IA

**Paramètres › Intelligence artificielle › Ajouter un fournisseur**, puis choisissez un préréglage :

| Fournisseur | Modèle par défaut | Remarque |
| --- | --- | --- |
| Anthropic — Claude | `claude-opus-5-5` | Clé API sur console.anthropic.com |
| OpenAI | `gpt-5` | |
| Mistral AI 🇫🇷 | `mistral-large-latest` | Hébergement européen |
| Google Gemini | `gemini-2.5-pro` | |
| Groq, OpenRouter, DeepSeek, xAI | — | API compatibles OpenAI |
| **Ollama** / **LM Studio** | `qwen3` / au choix | **100 % local et gratuit** : aucune donnée ne quitte votre machine |
| Personnalisé | — | Toute API compatible OpenAI (URL + clé) |

Les clés API sont chiffrées dans la base. L'assistante Iris :

- répond en s'appuyant sur vos données (recherche, fiches, pipeline, indicateurs) ;
- agit pour vous (créer un devis, une tâche, déplacer une opportunité, répondre à un ticket…) ;
- vous demande **votre validation** avant toute action d'écriture ou sensible (envoi d'email, émission de facture,
  paiement, suppression) — réglable dans les paramètres ;
- peut **pseudonymiser** les données personnelles (noms, emails, téléphones) avant envoi au modèle.

## Utiliser votre abonnement Claude (MCP)

Prisme expose un **serveur MCP** : Claude Desktop ou Claude Code (avec votre abonnement Claude Pro/Max/Team)
peuvent consulter et piloter le CRM avec les mêmes 19 outils qu'Iris, plus 5 prompts prêts à l'emploi
(Brief du jour, Préparer un rendez-vous, Relances de factures, Revue de pipeline, Enregistrer un lead).

La page **Paramètres › Claude (MCP)** génère les configurations exactes pour votre installation. En résumé :

**Claude Code — serveur Prisme distant (HTTP)** : créez un jeton dans *Paramètres › Claude (MCP)* puis

```bash
claude mcp add --transport http prisme https://votre-crm.fr/mcp --header "Authorization: Bearer <VOTRE_JETON>"
```

**Claude Code — Prisme sur la même machine (stdio)** :

```bash
claude mcp add prisme -- uv --directory /chemin/vers/crm/backend run prisme mcp
```

**Claude Desktop** (`claude_desktop_config.json`, Prisme installé localement) :

```json
{
  "mcpServers": {
    "prisme": {
      "command": "uv",
      "args": ["--directory", "/chemin/vers/crm/backend", "run", "prisme", "mcp"],
      "env": { "PRISME_MCP_USER": "vous@entreprise.fr" }
    }
  }
}
```

**Claude Desktop vers un Prisme distant** : utilisez le pont `mcp-remote`
(`"command": "npx", "args": ["-y", "mcp-remote", "https://votre-crm.fr/mcp", "--header", "Authorization: Bearer <VOTRE_JETON>"]`).

En mode stdio, les actions sont journalisées au nom de l'utilisateur `PRISME_MCP_USER` (à défaut, le premier
administrateur). En HTTP, le jeton identifie l'utilisateur et ses droits.

---

## Conformité française

Prisme intègre les règles françaises de facturation et de protection des données. **Il prépare des documents et des
flux conformes, mais ne remplace ni votre expert-comptable ni un conseil juridique** : faites valider vos réglages
(mentions, taux, délais) par un professionnel.

**Facturation (Code de commerce, CGI)**

- Mentions obligatoires contrôlées avant émission (identité et SIREN des parties, TVA intracommunautaire, adresse,
  date de prestation, nature de l'opération, taux et montants de TVA, échéance, pénalités de retard, **indemnité
  forfaitaire de 40 €** pour frais de recouvrement, escompte).
- **Numérotation continue** attribuée à l'émission (`FA-AAAA-NNNNN`, avoirs `AV-…`) ; une facture émise est
  **verrouillée** : elle ne peut plus être modifiée ni supprimée, la correction passe par un **avoir**.
- **Chaînage d'intégrité SHA-256** des factures émises, vérifiable en un clic.
- Délais de paiement plafonnés à **60 jours** (loi LME) avec alerte.
- Mention « Autoliquidation » pour les prestations intracommunautaires, option « TVA sur les débits ».
- **Factur-X** (profil EN 16931, PDF/A-3 avec XML embarqué) en vue de la **réforme de la facturation électronique** :
  réception obligatoire pour toutes les entreprises au 1er septembre 2026, émission obligatoire au 1er septembre
  2026 (grandes entreprises et ETI) puis au 1er septembre 2027 (PME et micro-entreprises). Prisme produit les
  factures au bon format ; la **transmission** doit passer par une **plateforme agréée (PA)** de votre choix —
  Prisme n'est pas une plateforme agréée.
- **Export FEC** (fichier des écritures comptables) pour votre comptable ou l'administration.
- Prisme n'est pas un logiciel de caisse certifié **NF525** : il ne doit pas servir d'encaissement de ventes à des
  particuliers au comptoir.

**Devis** : signature électronique simple (règlement eIDAS) avec preuve conservée (nom, email, date, adresse IP,
empreinte du document).

**RGPD / CNIL**

- Consentement explicite et tracé (preuve horodatée, texte présenté, source) pour la prospection ; case jamais
  pré-cochée sur les formulaires ; lien de **désinscription** automatique dans chaque email marketing.
- Opposition « ne pas contacter » bloquante pour tous les envois d'emails ; indicateur « ne pas appeler » (Bloctel)
  affiché sur la fiche.
- Droits des personnes : **export** des données (accès/portabilité) et **anonymisation** (effacement) depuis la
  fiche contact, les factures restant conservées 10 ans (obligation comptable).
- Durée de conservation des prospects (3 ans recommandés par la CNIL) avec purge assistée.
- Journal d'audit (connexions, exports, émissions de factures, suppressions…), mots de passe robustes (12
  caractères min.), secrets chiffrés, suivi d'ouverture des emails désactivé par défaut.
- Pseudonymisation optionnelle des données envoyées aux fournisseurs d'IA ; possibilité d'utiliser une IA 100 % locale.

---

## Configuration

Toutes les variables sont optionnelles.

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `PRISME_DATA_DIR` | Dossier des données (base SQLite, fichiers, clé secrète) | `crm/data` (sources) ou `~/.prisme` |
| `PRISME_DATABASE_URL` | Base SQLAlchemy, ex. `postgresql+psycopg://user:mdp@hote/prisme` | SQLite dans `PRISME_DATA_DIR` |
| `PRISME_SECRET_KEY` | Clé de signature des sessions et de chiffrement | générée dans `secret.key` |
| `PRISME_HOST` / `PRISME_PORT` | Adresse d'écoute | `127.0.0.1` / `8000` |
| `PRISME_PUBLIC_URL` | URL publique utilisée dans les emails | URL de la requête |
| `PRISME_TZ` | Fuseau horaire métier | `Europe/Paris` |
| `PRISME_SESSION_DAYS` | Durée des sessions | `30` |
| `PRISME_MCP_USER` | Utilisateur du serveur MCP en stdio | premier administrateur |
| `PRISME_STATIC_DIR` | Dossier de l'interface construite | `frontend/dist` |
| `PRISME_DISABLE_SCHEDULER` | `1` pour désactiver les tâches planifiées (relances, rappels…) | — |

SQLite (mode WAL) convient très bien à une équipe de quelques dizaines de personnes. PostgreSQL est pris en charge
via `PRISME_DATABASE_URL` (dépendance optionnelle `postgres`, déjà incluse dans l'image Docker ; suite de tests validée
sur PostgreSQL 16).

---

## Données, sauvegardes et sécurité

- **Sauvegarde** : *Paramètres › Import / export › Sauvegarde* télécharge un export JSON complet des données. Pour une
  sauvegarde intégrale (base + fichiers joints), copiez régulièrement le dossier `PRISME_DATA_DIR` (Docker : volume
  `prisme-data`), en incluant `secret.key` : sans elle, les clés API et mots de passe SMTP chiffrés ne sont plus
  lisibles.
- Exports CSV de chaque module, export FEC, export RGPD par contact.
- Sessions par cookie `HttpOnly` + protection CSRF, jetons API hachés, rôles (administrateur, manager, membre,
  lecteur), en-têtes de sécurité sur les fichiers servis.
- En production, servez Prisme en **HTTPS** derrière un reverse proxy.

---

## Architecture et développement

```
crm/
├── backend/           API FastAPI + SQLModel, serveur MCP, IA, services métier (Python 3.11+)
│   └── prisme/
│       ├── api/       endpoints REST
│       ├── ai/        assistante : outils, fournisseurs (Anthropic, compatibles OpenAI), boucle agent
│       ├── models/    modèles de données
│       ├── services/  facturation, PDF/Factur-X, RGPD, analytics, emails, automatisations, planificateur
│       └── mcp_server.py
├── frontend/          React 19 + TypeScript + Vite + Tailwind CSS v4 (Liquid Glass, Three.js, PWA)
├── Dockerfile, docker-compose.yml
└── start.sh / start.ps1 / start.bat
```

Développement :

```bash
# API (rechargement automatique) — http://127.0.0.1:8000/api/docs
cd crm/backend && uv run prisme serve --reload

# Interface (rechargement à chaud) — http://localhost:5173, proxy vers l'API
cd crm/frontend && npm install && npm run dev

# Tests et vérification des types
cd crm/backend && uv run pytest
# … ou sur PostgreSQL : PRISME_DATABASE_URL=postgresql+psycopg://… uv run --extra postgres pytest
cd crm/frontend && npm run typecheck
```

L'API est documentée automatiquement (OpenAPI) sur `/api/docs`.
