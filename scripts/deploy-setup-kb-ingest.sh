#!/usr/bin/env bash
# Run during production build so `calls/kb/scripts/.venv` exists when `vite preview` handles
# POST /api/oz/knowledge-base/ingest (same pattern as local dev).
#
# Set SKIP_KB_INGEST_SETUP=1 to skip (e.g. static demo with no DB ingest).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$ROOT/calls/kb/scripts"
REQ="$SCRIPTS_DIR/requirements-kb-ingest.txt"
VENV_PY="$SCRIPTS_DIR/.venv/bin/python"

if [[ "${SKIP_KB_INGEST_SETUP:-}" == "1" ]]; then
  echo "[deploy-setup-kb-ingest] SKIP_KB_INGEST_SETUP=1 — skipping Python venv."
  exit 0
fi

if [[ ! -f "$REQ" ]]; then
  echo "[deploy-setup-kb-ingest] requirements not found at $REQ — skipping."
  exit 0
fi

if [[ -x "$VENV_PY" ]]; then
  echo "[deploy-setup-kb-ingest] venv already present: $VENV_PY"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[deploy-setup-kb-ingest] WARNING: python3 not on PATH — KB file ingest will fail until Python + venv are available."
  echo "  Fix: use a deploy image that includes Python 3, or add a Dockerfile that installs python3 and runs this script."
  exit 0
fi

echo "[deploy-setup-kb-ingest] Creating venv and installing calls/kb/scripts dependencies..."
cd "$SCRIPTS_DIR"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements-kb-ingest.txt
echo "[deploy-setup-kb-ingest] Done: $VENV_PY"
