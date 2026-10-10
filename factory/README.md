# swf — usine logicielle autonome, économe en tokens

Demande métier → spec → application FastAPI complète (API, UI, tests, Docker, CI, docs), validée et déployable, avec rollback.
**0 token LLM sur le chemin standard** : le LLM ne sert qu'aux deltas (spec sur mesure, règles métier, corrections).

## 1. Démarrage (2 min)
```bash
cd factory && pip install -e ".[llm]"            # [llm] = claude-agent-sdk (optionnel)
swf new "CRM pour suivre prospects et ventes" --out ../apps/crm --name "Acme CRM"
cd ../apps/crm && uvicorn app.main:app           # UI http://localhost:8000 · OpenAPI /docs
swf deploy . --target docker --port 8000          # health-gated + rollback auto
```
Résultats mesurés sans LLM : CRM 4 entités → 25 fichiers, environ 3 s pour lint, tests et smoke. Demandes libres (école de musique, cabinet médical, association, flotte de véhicules) → applications au vert.
Chemin LLM (`new` → `fix` → `feature` → `cost`) testé de bout en bout à travers le **vrai** `claude_agent_sdk` avec un binaire `claude` simulé (`tests/fake_claude.py`, 0 token) : arguments CLI, périmètre `dontAsk`, refus des écritures hors périmètre, ledger.
Capacités de la plateforme et sources : [CAPABILITIES.md](CAPABILITIES.md).

## 2. Commandes
| Commande | Rôle | LLM |
|---|---|---|
| `swf presets` | liste des modèles prêts (crm, helpdesk, inventory) | non |
| `swf spec "<demande>" -o spec.json` | demande libre → spec | `SWF_LLM=1` : agent produit ; sinon preset (si forte correspondance) ou compositeur hors ligne (`swf/nlspec.py`) |
| `swf new "<demande>" --out DIR [--preset P] [--docker]` | spec → génération → validation → boucle de correction | optionnel |
| `swf gen spec.json --out DIR` | régénération incrémentale (hash) | non |
| `swf validate DIR [--docker]` | lint+sécurité (ruff E,F,W,B,S,I) → pytest → smoke HTTP → build Docker | non |
| `swf feature DIR "<demande>"` | planner → coders **en parallèle par entité** → validation → correction → restauration si échec | oui |
| `swf fix DIR` | boucle correction jusqu'au vert, snapshot/restore | oui |
| `swf review DIR` | revue sécurité des hooks → `.factory/security.md` | oui |
| `swf deploy DIR --target docker\|local [--dry-run]` | validation bloquante → release → health check → rollback auto | non |
| `swf monitor DIR [--interval 15 --max-failures 3]` | superviseur : `/health` + `/metrics` → `.factory/monitor.jsonl`, rollback auto | non |
| `swf rollback DIR` · `swf status DIR` · `swf cost DIR` | release précédente (copie immuable) · santé · coût LLM par rôle | non |

Le LLM est **désactivé par défaut** : `export SWF_LLM=1` pour l'activer (consomme des tokens). Les modèles et budgets se surchargent par rôle avec `SWF_MODEL_CODER=opus` et `SWF_BUDGET_CODER=1.0`.

## 3. Architecture
```
demande ─► [product*] ─► spec.json ─► generator (déterministe) ─► app/
                                                                   ├─ main.py      moteur générique (managé)
                                                                   ├─ schema.json  modèle (source de vérité)
                                                                   ├─ hooks/<e>.py règles métier (protégé)
                                                                   └─ static/      UI (managée)
           ┌───────────── pipeline: lint+sécu → tests → smoke → docker ─────────────┐
           │ échec → [fixer*] (tail 60 lignes) → regen → revalide (≤N) → restore     │
           └────────────────────────────────────────────────────────────────────────┘
deploy: build → run → /health → promote | rollback          (* = agent LLM)
```
| Agent | Implémentation | Modèle / plafond |
|---|---|---|
| produit | LLM `product` (spec JSON), sinon preset | haiku · 4 tours · 0,10 $ |
| architecture | **déterministe** : template + spec validée (types, refs, cycles) | — |
| code | LLM `planner` + `coder` ×N en parallèle (1 entité = 2 fichiers) | haiku / sonnet · 0,15 $ / 0,60 $ |
| tests | **déterministe** : tests de contrat générés depuis la spec + tests custom par le coder | — |
| sécurité | **déterministe** : ruff `S` (bandit), clé d'API, non-root, requêtes paramétrées ; LLM `security` à la demande | haiku · 0,15 $ |
| correction | LLM `fixer` | sonnet · 10 tours · 0,50 $ |
| déploiement | **déterministe** : Docker/local, health gate, rollback, 10 releases | — |
| documentation | **déterministe** : README, OpenAPI `/docs`, CLAUDE.md | — |

## 4. Économie de tokens (implémenté)
- [x] Chemin standard 100 % déterministe ; LLM uniquement pour les deltas.
- [x] Contexte minimal : résumé de spec 1 ligne/entité (≈ 3× plus court que le JSON, testé) + liste des fichiers + 60 dernières lignes de l'échec.
- [x] Prompts système stables par rôle → préfixe réutilisable par le prompt caching.
- [x] Cache des résultats `(rôle, modèle, tâche, contexte, contenu des fichiers éditables)` → 0 appel si rien n'a changé.
- [x] Périmètre dur : `permission_mode="dontAsk"` + `allowed_tools=["Edit(app/hooks/deal.py)", …]` → l'agent ne peut ni lire tout le repo ni éditer hors de sa cible.
- [x] Plafonds par rôle : `max_turns`, `max_budget_usd` ; échec rapide (le pipeline s'arrête au 1er échec).
- [x] Tâches atomiques et parallèles (1 coder par entité, `asyncio.gather`).
- [x] Génération incrémentale par hash ; fichiers métier jamais écrasés ; sauvegarde des fichiers managés modifiés à la main.
- [x] Ledger `.factory/ledger.jsonl` (coût, tours, usage) → `swf cost`.

## 5. Application générée
- API REST par entité : CRUD, recherche `q`, filtres par champ, tri, pagination, export CSV, `/_stats?by=` (pipeline/kanban), `/health`, `/api/_schema`.
- Types : str, text, email, int, float, bool, date, datetime, enum, ref (FK, `ON DELETE SET NULL`).
- Migrations additives automatiques (nouvelles entités/champs sans perte de données).
- Sécurité : `API_KEY` (comparaison à temps constant), conteneur non-root, healthcheck Docker, validation stricte (422), SQL paramétré.
- Logs JSON par requête (méthode, chemin, statut, ms) → n'importe quel collecteur (Loki, Datadog, CloudWatch).
- `/metrics` Prometheus (requêtes et latences par route et statut, lignes par entité, taille de la base, webhooks).
- Webhooks `entity.created|updated|deleted` signés HMAC-SHA256 (`WEBHOOK_URL`, `WEBHOOK_SECRET`), via un worker asynchrone avec retries.
- UI web sans dépendance (clair/sombre, mobile) générée depuis le schéma.
- CI GitHub Actions : ruff → pytest → build Docker → smoke.

## 6. Checklist de mise en production
- [ ] `export API_KEY=$(openssl rand -hex 24)` avant `swf deploy`
- [ ] Reverse proxy TLS (Caddy/Traefik/Nginx) devant le port 8000
- [ ] Sauvegarde du volume `<app>-data` (SQLite) : `docker run --rm -v <app>-data:/d -v $PWD:/b alpine tar czf /b/backup.tgz /d`
- [ ] Forte charge en écriture ou plusieurs instances → migrer vers Postgres (le moteur est isolé dans `app/main.py:db()`)
- [ ] Supervision : alerte sur `/health` (UptimeRobot, Prometheus blackbox) + collecte des logs JSON
- [ ] `swf review .` (si LLM activé) avant la 1re mise en ligne
- [ ] Registry derrière un proxy ou limité : `BASE_IMAGE=mirror.gcr.io/library/python:3.12-slim swf deploy …`

## 7. Capacités de la plateforme
Voir [CAPABILITIES.md](CAPABILITIES.md) : matrice capacité → statut vérifié → usage dans swf.
