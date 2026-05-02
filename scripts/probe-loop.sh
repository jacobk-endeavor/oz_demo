#!/usr/bin/env bash
# probe-loop.sh — kill any running vite, restart it, wait for the chat config
# endpoint, and run scripts/probe-agentic-chat.ts. Designed to be re-run after
# every wiring fix until all probes pass.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${OZ_PROBE_LOG:-/tmp/oz-vite-dev.log}"
PID_FILE="${OZ_PROBE_PID:-/tmp/oz-vite-dev.pid}"
BASE_URL="${OZ_PROBE_BASE_URL:-http://localhost:5173}"
READY_TIMEOUT_SECONDS="${OZ_PROBE_READY_TIMEOUT:-90}"

stop_vite() {
  echo "[probe-loop] stopping any running vite dev server..."
  # Kill anything that looks like a dev server, but leave `vite preview` alone.
  pkill -f "vite --host" 2>/dev/null || true
  pkill -f "node .*node_modules/.bin/vite$" 2>/dev/null || true
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" || true)
    if [ -n "${PID:-}" ]; then kill -9 "$PID" 2>/dev/null || true; fi
    rm -f "$PID_FILE"
  fi
  sleep 1
}

start_vite() {
  echo "[probe-loop] starting vite dev server (logs: $LOG_FILE)"
  : > "$LOG_FILE"
  ( cd "$REPO_ROOT" && nohup npm run dev > "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE" )
  echo "[probe-loop] PID=$(cat "$PID_FILE")"
}

wait_ready() {
  echo "[probe-loop] waiting up to ${READY_TIMEOUT_SECONDS}s for $BASE_URL/api/oz/chat/config..."
  local i=0
  while [ "$i" -lt "$READY_TIMEOUT_SECONDS" ]; do
    if curl -fs --max-time 3 "$BASE_URL/api/oz/chat/config" > /dev/null 2>&1; then
      echo "[probe-loop] ready after ${i}s"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "[probe-loop] TIMEOUT: server never responded — last 50 log lines:"
  tail -n 50 "$LOG_FILE" || true
  return 1
}

run_probes() {
  echo "[probe-loop] running probes..."
  ( cd "$REPO_ROOT" && OZ_PROBE_BASE_URL="$BASE_URL" npx --no-install tsx scripts/probe-agentic-chat.ts )
}

stop_vite
start_vite
if ! wait_ready; then
  exit 2
fi
run_probes
PROBE_EXIT=$?
echo "[probe-loop] probe script exited with $PROBE_EXIT"
exit $PROBE_EXIT
