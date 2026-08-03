#!/bin/bash
# Rebuild, restart the production server, and capture the landing hero.
#
#   bash scripts/preview.sh            # build + serve + shoot
#   bash scripts/preview.sh --probe    # also print the framing measurements
#   bash scripts/preview.sh --serve    # build + serve only
#   PORT=3210 bash scripts/preview.sh  # pick the port
#
# To shoot a server that is already up — the dev server on :3003, say — skip this
# and run the capture straight at it:
#
#   node scripts/shoot.mjs --url http://localhost:3003
#
# The restart is not optional politeness: `next start` keeps serving the .next it
# booted with, so a rebuild alone leaves the old chunks live and the page 500s on
# a chunk hash that no longer exists. That failure is silent in the browser — the
# hero just falls back to its static backdrop — so it is worth doing properly.
#
# Defaults to :3210 rather than :3000 so it never fights the dev servers this
# repo already runs on 3000-3003.
set -e
PORT=${PORT:-3210}
cd "$(dirname "$0")/.."

pnpm exec next build 2>&1 | grep -E "Compiled|Failed|error|Error" || true

PID=$(lsof -ti "tcp:$PORT" 2>/dev/null | head -1)
if [ -n "$PID" ]; then
  echo "stopping old server (pid $PID)"
  kill "$PID" 2>/dev/null || true
  sleep 2
fi

nohup pnpm exec next start -p "$PORT" > "/tmp/krafta-pay-next$PORT.log" 2>&1 &
for _ in $(seq 1 20); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" || true)
  [ "$code" = "200" ] && break
done
echo "server: ${code:-down} on :$PORT"
[ "$code" = "200" ] || { echo "--- server log ---"; tail -20 "/tmp/krafta-pay-next$PORT.log"; exit 1; }

[ "$1" = "--serve" ] && exit 0

node scripts/shoot.mjs --url "http://localhost:$PORT" "${@}"
[ "$1" = "--probe" ] && node scripts/frame-probe.mjs --url "http://localhost:$PORT"
exit 0
