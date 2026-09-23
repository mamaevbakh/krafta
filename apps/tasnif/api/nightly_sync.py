"""The nightly catalog sync, as a Vercel Function the cron calls (see vercel.json).

Every call carries tonight's run forward for up to BUDGET_SECONDS of starting new steps
(scripts/sync_catalog.py has the steps and why); the cron calls every 15 minutes between
02:00 and 05:00 Tashkent time, so a night with new codes spreads over several calls and a
quiet night finishes in the first.

Only Vercel's cron may call it: Vercel sends `Authorization: Bearer $CRON_SECRET` when
that project variable is set, and anything else gets a 401. It connects as the
`tasnif_sync` role through TASNIF_DATABASE_URL, never with the site's service key.
"""

from __future__ import annotations

import hmac
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

# Stop starting steps after 10 minutes. vercel.json allows the function 800 seconds, and a
# step already running (at most a few minutes by then) needs room to finish.
BUDGET_SECONDS = 600


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        secret = os.environ.get("CRON_SECRET", "")
        given = self.headers.get("Authorization", "")
        if not secret or not hmac.compare_digest(given, f"Bearer {secret}"):
            self._reply(401, {"error": "unauthorized"})
            return
        if not os.environ.get("TASNIF_DATABASE_URL"):
            self._reply(500, {"error": "TASNIF_DATABASE_URL is not set"})
            return

        from import_catalog import database
        from sync_catalog import STEPS, Budget, run

        try:
            notes = run(database("hlmcoirjaydrfqcmnuun"), Budget(BUDGET_SECONDS))
        except Exception as error:  # the run row keeps the error; the next call retries
            traceback.print_exc()
            self._reply(500, {"error": f"{type(error).__name__}: {error}"[:500]})
            return
        self._reply(200, {
            "finished": all(step in notes.get("done", []) for step in STEPS),
            "done": notes.get("done", []),
            "summary": notes.get("summary", {}),
        })

    def _reply(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
