"""MCP server: lets Claude Desktop / Claude Code (with your Claude subscription) drive the CRM.

Two transports, same tools as the in-app assistant:
- stdio  : `prisme mcp` (Claude Desktop « mcpServers », Claude Code `claude mcp add`)
- HTTP   : POST /mcp with `Authorization: Bearer <jeton API>` (Claude Code --transport http,
           connecteurs distants si le CRM est exposé en HTTPS)
"""

from __future__ import annotations

import json
import logging
from typing import Any

import anyio
import mcp_types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPASGIApp, StreamableHTTPSessionManager
from sqlmodel import select

from . import __version__
from .ai import tools
from .config import settings as env
from .db import session_scope
from .models import User

log = logging.getLogger("prisme.mcp")

INSTRUCTIONS = (
    "Prisme est le CRM de l'entreprise (contacts, entreprises, opportunités, devis, factures conformes, abonnements/MRR, "
    "projets, temps, agenda, support, marketing). Utilise search_crm pour retrouver un élément cité par son nom, list_records "
    "pour les listes filtrées, get_record pour une fiche complète et get_metrics pour les indicateurs. Les écritures passent par "
    "les mêmes règles que l'interface : une facture émise est inaltérable (corriger par avoir), et les contacts opposés aux "
    "sollicitations ne doivent jamais être contactés. Cite les éléments avec leur identifiant."
)

PROMPTS = {
    "brief-du-jour": {
        "title": "Brief du jour",
        "description": "Synthèse de la journée : chiffres clés, tâches, rendez-vous, affaires à risque.",
        "arguments": [],
        "text": "Fais-moi le brief du jour à partir du CRM Prisme : chiffres clés (CA du mois, encaissements, MRR, pipeline), mes tâches et rendez-vous, affaires à risque et factures en retard. Termine par mes 3 priorités.",
    },
    "preparer-rendez-vous": {
        "title": "Préparer un rendez-vous",
        "description": "Dossier de préparation d'un rendez-vous client ou prospect.",
        "arguments": [{"name": "client", "description": "Nom du contact ou de l'entreprise", "required": True}],
        "text": "Prépare mon rendez-vous avec {client} : retrouve la fiche dans le CRM, résume l'historique, les opportunités, devis, factures et tickets en cours, puis propose un objectif de rendez-vous, 5 questions à poser et les points de vigilance.",
    },
    "relances-factures": {
        "title": "Relances de factures",
        "description": "Plan de relance des factures en retard avec emails prêts à envoyer.",
        "arguments": [],
        "text": "Liste les factures en retard dans le CRM, classe-les par montant et ancienneté, et propose pour chacune un email de relance adapté (ton cordial puis ferme), en rappelant les pénalités de retard et l'indemnité forfaitaire de 40 €.",
    },
    "revue-pipeline": {
        "title": "Revue de pipeline",
        "description": "Analyse du pipeline commercial et actions recommandées.",
        "arguments": [],
        "text": "Fais une revue de mon pipeline commercial dans Prisme : valeur par étape, affaires bloquées ou en retard, prévision pondérée du mois, et 5 actions concrètes pour accélérer les ventes.",
    },
    "nouveau-lead": {
        "title": "Enregistrer un lead",
        "description": "Créer un contact, son entreprise et une opportunité à partir d'informations brutes.",
        "arguments": [{"name": "informations", "description": "Signature email, carte de visite, notes...", "required": True}],
        "text": "À partir de ces informations, crée (sans doublon) l'entreprise, le contact et une opportunité dans le CRM, puis planifie une tâche de rappel dans 2 jours :\n\n{informations}",
    },
}


def _resolve_user(request: Any) -> int:
    if request is not None:
        state = getattr(request, "scope", {}).get("state", {}) if hasattr(request, "scope") else {}
        uid = state.get("prisme_user_id") if isinstance(state, dict) else None
        if uid:
            return int(uid)
        raise PermissionError("Jeton API manquant ou invalide.")
    with session_scope() as session:
        stmt = select(User).where(User.is_active == True)  # noqa: E712
        if env.mcp_user:
            stmt = stmt.where(User.email == env.mcp_user.lower())
        else:
            stmt = stmt.where(User.role == "admin")
        user = session.exec(stmt.order_by(User.id)).first()
        if user is None:
            raise PermissionError("Aucun utilisateur actif : terminez l'installation de Prisme (création du compte administrateur).")
        return user.id


def _annotations(t: tools.Tool) -> types.ToolAnnotations:
    return types.ToolAnnotations(
        title=t.title,
        read_only_hint=t.risk == tools.READ,
        destructive_hint=t.name in ("delete_record",),
        idempotent_hint=t.risk == tools.READ,
        open_world_hint=t.name == "send_email",
    )


async def list_tools(ctx: Any, params: Any) -> types.ListToolsResult:
    return types.ListToolsResult(
        tools=[
            types.Tool(name=t.name, title=t.title, description=t.description, input_schema=t.schema, annotations=_annotations(t))
            for t in (tools.TOOLS[n] for n in sorted(tools.TOOLS))
        ]
    )


async def call_tool(ctx: Any, params: types.CallToolRequestParams) -> types.CallToolResult:
    try:
        user_id = _resolve_user(getattr(ctx, "request", None))
    except PermissionError as exc:
        return types.CallToolResult(content=[types.TextContent(type="text", text=str(exc))], is_error=True)

    def run() -> tuple[bool, str]:
        with session_scope() as session:
            user = session.get(User, user_id)
            if user is None or not user.is_active:
                return False, json.dumps({"error": "Utilisateur inactif."})
            if user.role == "viewer" and tools.TOOLS.get(params.name) and tools.TOOLS[params.name].risk != tools.READ:
                return False, json.dumps({"error": "Votre rôle (lecture seule) ne permet pas les modifications."}, ensure_ascii=False)
            ok, text, _ = tools.execute(tools.ToolContext(session=session, user=user, channel="mcp"), params.name, dict(params.arguments or {}))
            return ok, text

    ok, text = await anyio.to_thread.run_sync(run)
    return types.CallToolResult(content=[types.TextContent(type="text", text=text)], is_error=not ok)


async def list_prompts(ctx: Any, params: Any) -> types.ListPromptsResult:
    return types.ListPromptsResult(
        prompts=[
            types.Prompt(
                name=name,
                title=p["title"],
                description=p["description"],
                arguments=[types.PromptArgument(name=a["name"], description=a["description"], required=a["required"]) for a in p["arguments"]],
            )
            for name, p in PROMPTS.items()
        ]
    )


async def get_prompt(ctx: Any, params: types.GetPromptRequestParams) -> types.GetPromptResult:
    prompt = PROMPTS.get(params.name)
    if prompt is None:
        raise ValueError(f"Prompt inconnu : {params.name}")
    args = {a["name"]: (params.arguments or {}).get(a["name"], "") for a in prompt["arguments"]}
    return types.GetPromptResult(
        description=prompt["description"],
        messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt["text"].format(**args)))],
    )


def build_server() -> Server:
    return Server(
        "prisme-crm",
        version=__version__,
        title="Prisme CRM",
        instructions=INSTRUCTIONS,
        on_list_tools=list_tools,
        on_call_tool=call_tool,
        on_list_prompts=list_prompts,
        on_get_prompt=get_prompt,
    )


async def run_stdio() -> None:
    from mcp.server.stdio import stdio_server

    from .db import init_db

    init_db()
    server = build_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


class MCPHttp:
    """ASGI app for /mcp: bearer-token auth in front of the streamable HTTP transport."""

    def __init__(self) -> None:
        self.server = build_server()
        self.manager = StreamableHTTPSessionManager(app=self.server, stateless=True, json_response=True)
        self.app = StreamableHTTPASGIApp(self.manager)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            return
        user_id = await anyio.to_thread.run_sync(self._authenticate, scope)
        if user_id is None:
            body = json.dumps({"error": "Jeton API invalide. Créez un jeton dans Prisme › Paramètres › Intégrations (portée « mcp »)."}).encode()
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json"), (b"www-authenticate", b"Bearer")]})
            await send({"type": "http.response.body", "body": body})
            return
        scope.setdefault("state", {})["prisme_user_id"] = user_id
        await self.app(scope, receive, send)

    @staticmethod
    def _authenticate(scope: dict[str, Any]) -> int | None:
        from urllib.parse import parse_qs

        from .deps import user_from_api_token
        from .services.settings import get_section

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        token = None
        auth = headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            token = (parse_qs(scope.get("query_string", b"").decode()).get("key") or [None])[0]
        if not token:
            return None
        with session_scope() as session:
            if not get_section(session, "mcp").get("enabled", True):
                return None
            user = user_from_api_token(session, token, scope="mcp")
            return user.id if user else None
