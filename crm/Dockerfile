# syntax=docker/dockerfile:1.7
# Prisme CRM — image tout-en-un (interface web + API + serveur MCP HTTP).

# 1) Interface (React/Vite) ----------------------------------------------------
FROM node:22-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2) Application Python ---------------------------------------------------------
FROM python:3.13-slim AS app
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PRISME_DATA_DIR=/data \
    PRISME_HOST=0.0.0.0 \
    PRISME_PORT=8000 \
    TZ=Europe/Paris
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --extra postgres
COPY backend/ ./
RUN uv sync --frozen --no-dev --extra postgres
COPY --from=ui /ui/dist ./prisme/static

RUN useradd --system --uid 10001 --home-dir /data prisme && mkdir -p /data && chown prisme /data
USER prisme
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1
CMD ["/app/.venv/bin/prisme", "serve"]
