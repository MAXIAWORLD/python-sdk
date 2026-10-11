"""Command line: `prisme serve | mcp | create-admin | demo | info`."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import sys


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="prisme", description="Prisme CRM — serveur web, serveur MCP et outils d'administration")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="Démarrer le serveur web (par défaut)")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", type=int, default=None)
    serve.add_argument("--reload", action="store_true", help="Rechargement automatique (développement)")

    sub.add_parser("mcp", help="Serveur MCP en stdio pour Claude Desktop / Claude Code")

    admin = sub.add_parser("create-admin", help="Créer un compte administrateur")
    admin.add_argument("--email")
    admin.add_argument("--name")

    sub.add_parser("demo", help="Charger les données de démonstration")
    sub.add_parser("info", help="Afficher la configuration")

    args = parser.parse_args(argv)
    command = args.command or "serve"

    if command == "serve":
        import uvicorn

        from .config import settings

        logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
        host = args.host if getattr(args, "host", None) else settings.host
        port = args.port if getattr(args, "port", None) else settings.port
        print(f"\n  ✦ Prisme CRM — http://{'localhost' if host in ('127.0.0.1', '0.0.0.0') else host}:{port}\n  ✦ Données : {settings.data_dir}\n")
        # Live update streams (SSE) never end on their own: cap the graceful shutdown so Ctrl+C / restarts are immediate.
        uvicorn.run("prisme.main:app", host=host, port=port, reload=getattr(args, "reload", False), proxy_headers=True, forwarded_allow_ips="*", log_level="info", timeout_graceful_shutdown=3)
        return

    if command == "mcp":
        # stdout is the MCP channel: logs must go to stderr only.
        logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
        from .mcp_server import run_stdio

        asyncio.run(run_stdio())
        return

    from sqlmodel import select

    from .config import settings
    from .db import init_db, session_scope
    from .models import User

    init_db()

    if command == "create-admin":
        from .security import hash_password, password_problems
        from .seed import ensure_defaults

        email = (args.email or input("Email : ")).strip().lower()
        name = args.name or input("Nom : ").strip()
        password = getpass.getpass("Mot de passe (12 caractères min.) : ")
        problem = password_problems(password)
        if problem:
            sys.exit(problem)
        with session_scope() as session:
            if session.exec(select(User).where(User.email == email)).first():
                sys.exit("Un utilisateur existe déjà avec cet email.")
            session.add(User(email=email, name=name, role="admin", password_hash=hash_password(password)))
            session.commit()
            ensure_defaults(session)
        print("Administrateur créé ✅")
        return

    if command == "demo":
        from .seed import ensure_defaults, seed_demo

        with session_scope() as session:
            admin = session.exec(select(User).where(User.role == "admin").order_by(User.id)).first()
            if admin is None:
                sys.exit("Créez d'abord un administrateur (prisme create-admin ou via l'interface).")
            ensure_defaults(session)
            seed_demo(session, admin)
        print("Données de démonstration chargées ✅")
        return

    if command == "info":
        print(f"Données      : {settings.data_dir}")
        print(f"Base         : {settings.database_url}")
        print(f"Interface    : {settings.static_dir}")
        print(f"Écoute       : {settings.host}:{settings.port}")
        return


if __name__ == "__main__":
    main()
