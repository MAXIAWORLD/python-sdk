# Capacités d'une session Claude cloud → usage dans swf

Accès Internet : **oui** (recherche web utilisée le 2026-10-10).
Légende : ✅ vérifié dans cette session · 📄 doc officielle Anthropic · ⚠️ source tierce, à confirmer.

| Capacité | Constat | Statut | Usage dans swf |
|---|---|---|---|
| Claude Code (CLI) | v2.1.296 installé, mode headless `claude -p`, stream-json | ✅ | binaire piloté par le SDK (`SWF_CLAUDE_CLI` pour le surcharger) |
| Claude Agent SDK (Python) | v0.2.159 : `query`, `ClaudeAgentOptions(agents, allowed_tools, permission_mode, max_turns, max_budget_usd, model, cwd, sandbox, hooks, mcp_servers, session_store, cli_path)` | ✅ | `swf/agents.py` : 1 appel borné par rôle |
| Permissions | `permission_mode` ∈ default, acceptEdits, plan, bypassPermissions, **dontAsk**, auto ; règles `Edit(path)`, `Bash(cmd:*)` | ✅ | `dontAsk` + liste blanche par fichier = périmètre dur par agent (testé) |
| Sous-agents | `agents={name: AgentDefinition}` ; l'outil `Agent` doit être autorisé | 📄 | non : swf orchestre lui-même en Python (moins de tokens que des sous-agents imbriqués) |
| Tool use / API Messages | outils JSON-schema, sortie structurée (`output_format`) | 📄 | l'agent produit écrit un fichier validé par `spec.validate` (pas de JSON dans le chat) |
| Prompt caching | page tarifs officielle : Sonnet 5.5 entrée 2 $/M, écriture 5 min 2,50 $, 1 h 4 $, **lecture 0,10 $ (0,05×)** ; Haiku 5.5 entrée 0,10 $, lecture 0,01 $ ; préfixe minimal cachable 286 tokens ; multiplicateurs cumulables avec Batch | 📄 | prompts système stables par rôle en tête, partie variable en fin ; le préfixe Claude Code dépasse largement 286 tokens |
| Message Batches | −50 % (Sonnet 5.5 : 1 $/5 $ par M), cumulable avec le cache, résultats sous 24 h | 📄 | génération de specs en masse ; pas de boucles agentiques (latence) |
| Contexte | Haiku 5.5 : tarif ×5 au-delà de 100 K tokens d'entrée ; `inference_geo: "us"` ×1,1 | 📄 | pack de contexte < 2 K (testé) : résumé de spec + fichiers + 60 lignes d'erreur |
| Coûts | `ResultMessage.total_cost_usd`, `usage` (y compris `cache_read_input_tokens`) | ✅ | ledger JSONL + `swf cost`, plafond `max_budget_usd` par rôle |
| MCP | connecteur API `mcp_servers`, en-tête beta `mcp-client-2025-11-20` (l'ancien `2025-04-04` est déprécié), allowlist/denylist d'outils, OAuth Bearer, plusieurs serveurs ; non éligible ZDR | 📄 | extension possible (ex. connecteur base de données) ; non requis |
| Computer use | `computer_toolset_20260801` (17 actions), sans en-tête beta, Opus/Sonnet 5.5, Haiku 5.5… ; à exécuter en VM isolée | 📄 | **non utilisé** : tout passe par CLI/HTTP, plus rapide et moins cher. Tests UI avec Playwright/Chromium (✅) |
| Sandbox cloud | conteneur éphémère, disque limité, accès réseau None/Trusted/Full/Custom, script de setup en cache | 📄✅ | état dans des fichiers (`.factory/`), commit et push avant la fin de session |
| Fichiers / Artifacts | fichiers locaux ; Artifacts = pages HTML publiées | ✅ | livrables = fichiers du repo ; UI de l'app générée en HTML statique |
| GitHub | PR, commentaires et CI via MCP GitHub ; action `claude-code-action` (@claude) avec `ANTHROPIC_API_KEY` en secret | ✅📄 | `.github/workflows/factory.yml` vert sur GitHub ; CI générée par app |
| CI/CD | GitHub Actions : ruff → pytest → docker build → smoke | ✅ | template `ci.yml` + workflow de l'usine |
| Docker | daemon disponible ; Docker Hub limité (429) ; proxy TLS dans le sandbox | ✅ | image non-root + healthcheck ; `BASE_IMAGE` pour un miroir |
| Base de données | SQLite (stdlib), migrations additives | ✅ | `app/main.py:db()` est le point unique à remplacer pour passer à Postgres |
| API REST | FastAPI + OpenAPI `/docs` | ✅ | CRUD, filtres, recherche, CSV, stats |
| Webhooks | sortants, signés HMAC-SHA256, 3 retries | ✅ | `WEBHOOK_URL` + `WEBHOOK_SECRET` (testé avec un vrai serveur HTTP) |
| Workers | thread worker + file bornée (1000), compteur de pertes | ✅ | livraison asynchrone des webhooks |
| Monitoring | `/health`, `/metrics` (Prometheus), logs JSON, Prometheus + 4 règles d'alerte + Alertmanager + dashboard Grafana | ✅ | `swf monitor` (sondes) + `swf alerthook` (alerte critique → rollback), testés avec de vrais conteneurs Prometheus/Alertmanager |
| Sécurité | ruff `S` (bandit), clé d'API à temps constant, SQL paramétré, conteneur non-root, agents limités à leurs fichiers | ✅ | bloquant dans `swf validate` / `swf deploy` |

Sources :
- [Tarifs officiels](https://platform.claude.com/docs/en/about-claude/pricing)
- [Computer use (officiel)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- [Connecteur MCP (officiel)](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Agent SDK, sous-agents](https://code.claude.com/docs/en/agent-sdk/subagents)
- [Message Batches](https://docs.anthropic.com/en/docs/build-with-claude/message-batches)
- [Annonce de la Batch API](https://anthropic.com/news/message-batches-api)
- [Connecteur MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector)
- [Environnements cloud](https://code.claude.com/docs/en/cloud-environments)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Tarifs API (eesel, tiers)](https://www.eesel.ai/blog/anthropic-api-pricing)
- [Claude Code en CI (noqta, tiers)](https://www.noqta.tn/en/blog/claude-code-ci-cd)
