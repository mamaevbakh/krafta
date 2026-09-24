#!/bin/zsh
# The daily tasnif catalog update, run on a Mac in Uzbekistan by launchd
# (uz.krafta.tasnif-sync.plist, next to this file).
#
# Why a Mac: tasnif.soliq.uz only accepts connections from Uzbekistan. Vercel,
# the Supabase database, Supabase functions and GitHub's runners all time out
# (tested 2026-09-24/25), and the founder chose not to rent a server in
# Uzbekistan. This runs scripts/sync_catalog.py with the machine's Supabase CLI
# login and the OpenAI key from .env.local, so it needs no secrets of its own.
#
# launchd starts it once a day; if the Mac was asleep at that hour, it starts on
# wake. A run paused by sleep continues on wake, and the sync itself refuses to
# run twice at once. Output goes to ~/Library/Logs/tasnif/sync.log.
set -u
APP="${0:A:h:h:h}"
LOG_DIR="$HOME/Library/Logs/tasnif"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/sync.log" 2>&1

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting in $APP"
cd "$APP" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PYTHONUNBUFFERED=1
OPENAI_API_KEY="$(grep -E '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)"
export OPENAI_API_KEY
if [[ -z "$OPENAI_API_KEY" ]]; then
  echo "no OPENAI_API_KEY in $APP/.env.local; stopping"
  exit 1
fi

caffeinate -i uv run --quiet --with openpyxl --with certifi --with truststore --with "psycopg[binary]" \
  scripts/sync_catalog.py
code=$?  # not "status": zsh reserves that name
echo "=== $(date '+%Y-%m-%d %H:%M:%S') finished with exit code $code"
exit $code
