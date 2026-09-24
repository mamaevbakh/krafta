"""The nightly catalog sync: bring tasnif up to date with the official IKPU catalog.

    pnpm --filter tasnif catalog:sync            # tonight's run, start to finish, from a laptop
    pnpm --filter tasnif catalog:sync --check    # download and compare fingerprints; write nothing
    pnpm --filter tasnif catalog:sync --force    # import the exports even if their content is unchanged

In production it runs once a day on a Mac in Uzbekistan (scripts/mac/daily-sync.sh,
started by launchd), because tasnif.soliq.uz only accepts connections from
Uzbekistan: Vercel, Supabase and GitHub all time out. There it reaches the database
through the Supabase CLI login, like the other scripts. It was also built to run on
Vercel (api/nightly_sync.py, several short calls a night within a time budget,
connecting as the `tasnif_sync` role through TASNIF_DATABASE_URL and reaching the
site through TASNIF_EGRESS_PROXY_URL); that schedule is off until a proxy in
Uzbekistan exists (apps/tasnif/README.md).

A day's run is one tasnif.sync_runs row (source 'nightly', one per Tashkent date).
Its notes hold which steps are done, so a run that stops or fails leaves the rest
to the next one. Steps, in order:

  catalog   Download the Russian export; if its content fingerprint differs from
            the last import (import_catalog.fingerprint: the committee's server
            re-stamps unchanged files, so bytes alone would differ every night),
            import it: new, changed and dropped codes.
  names     The Uzbek Latin and Cyrillic exports, the same way. Also imported when
            the catalog was, since new codes arrive without Uzbek names.
  inactive  The list of switched-off codes, the same way.
  details   Uzbek names, package codes and benefit names for codes that appeared
            since the first import, from the official per-code endpoint at 3
            requests a second; package codes for new codes exist nowhere else. A
            few hundred per call, until none are left.
  refresh   Rebuild the search documents of every catalog group changed tonight,
            then drop documents of codes that were switched off.
  words     Everyday words for new categories and service/cafe codes (the AI
            pass, pending entries only), and rebuild their groups.
  embed     Embeddings for every document whose text changed.

These are the homepage downloads the founder approved for nightly use; the units
export on the catalog page sits behind a captcha and is never fetched. Every step
is safe to repeat: each decides what to do from the data, not from a log.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import shutil
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import certifi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_catalog  # noqa: E402
import import_inactive  # noqa: E402
import import_names  # noqa: E402
from backfill_details import fetch_details, official_opener  # noqa: E402
from embed_documents import embed_pending  # noqa: E402
from everyday_terms import write_pending  # noqa: E402
from import_catalog import database, fingerprint, sql_json, sql_text  # noqa: E402
from refresh_search import refresh  # noqa: E402

BASE = "https://tasnif.soliq.uz/api/cls-api/excel/get"
EXPORTS = {
    "ru": f"{BASE}/category?lang=ru",
    "uz_latn": f"{BASE}/category?lang=uz_latn",
    "uz_cyrl": f"{BASE}/category?lang=uz_cyrl",
    "inactive": f"{BASE}/inactive-mxik?lang=ru",
}
# The smallest believable export. The catalogs are ~31 MB and the switched-off list ~14 MB;
# an error page or a truncated download is far smaller and must never reach an importer.
MIN_BYTES = {"ru": 10_000_000, "uz_latn": 10_000_000, "uz_cyrl": 10_000_000, "inactive": 5_000_000}
STEPS = ["catalog", "names", "inactive", "details", "refresh", "words", "embed"]
# A heavy step (parse and import a whole export, or rebuild many groups) starts only this
# early in a call, so it finishes well inside Vercel's limit; each takes ~5-10 minutes on a
# night with changes.
HEAVY_START_SECONDS = 90
DETAILS_PER_CALL = 400
# Codes per document-rebuild statement: a few seconds each, well inside any statement timeout.
REFRESH_CHUNK = 5000


class Budget:
    """How long this call may keep starting steps. None: no limit (a laptop)."""

    def __init__(self, seconds: float | None) -> None:
        self.started = time.time()
        self.seconds = seconds

    def elapsed(self) -> float:
        return time.time() - self.started

    def allows(self, heavy: bool = False) -> bool:
        if self.seconds is None:
            return True
        return self.elapsed() < (HEAVY_START_SECONDS if heavy else self.seconds)


class Downloads:
    """The exports, fetched at most once per call, into a temporary directory."""

    def __init__(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="tasnif-sync-")
        self.files: dict[str, Path] = {}

    def get(self, name: str) -> Path:
        if name not in self.files:
            self.files[name] = download(name, EXPORTS[name], Path(self.directory.name) / f"{name}.xlsx")
        return self.files[name]

    def close(self) -> None:
        self.directory.cleanup()


def download(name: str, url: str, target: Path, attempts: int = 3) -> Path:
    """Stream one export to disk and check it is a whole .xlsx before anything reads it.

    Uses certifi's CA bundle: the committee's server sends its full chain, which that bundle
    verifies on any machine (a macOS python.org build has no system store to fall back on).
    Goes through TASNIF_EGRESS_PROXY_URL when set: the site refuses the big clouds, Vercel
    included (see backfill_details.official_opener).
    """
    context = ssl.create_default_context(cafile=certifi.where())
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={
                "User-Agent": "tasnif.krafta.uz nightly sync (+https://tasnif.krafta.uz)"})
            with official_opener(context).open(request, timeout=300) as response, target.open("wb") as out:
                shutil.copyfileobj(response, out, length=1 << 20)
            if target.stat().st_size >= MIN_BYTES[name] and zipfile.is_zipfile(target):
                print(f"  downloaded {name}: {target.stat().st_size:,} bytes", flush=True)
                return target
            problem = f"{target.stat().st_size:,} bytes, not a full export"
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException, OSError) as error:
            problem = f"{type(error).__name__}: {error}"
        print(f"  {name}: attempt {attempt} failed ({problem})", flush=True)
        time.sleep(20 * attempt)
    raise RuntimeError(f"could not download the {name} export from {url}")


def last_fingerprints(api) -> dict[str, str]:
    """The fingerprint of the last complete, successful import of each source."""
    rows = api.query("""
        select distinct on (source) source, source_sha256
        from tasnif.sync_runs
        where error is null and finished_at is not null and source_sha256 is not null
          and source in ('excel', 'excel_uz', 'inactive_excel')
          and notes->>'only_groups' is null
        order by source, id desc""")
    return {row["source"]: row["source_sha256"] for row in rows}


def tonight(api) -> dict:
    """Tonight's run row (one per Tashkent date), created by the first call of the night.

    A row an earlier night left unfinished is closed with an error first, so the footer
    never claims a date on which the sync didn't finish.
    """
    api.query("""
        update tasnif.sync_runs set finished_at = now(),
          error = coalesce(error, 'did not finish: ' || coalesce(notes->>'last_error', 'ran out of calls'))
        where source = 'nightly' and finished_at is null
          and (started_at at time zone 'Asia/Tashkent')::date < (now() at time zone 'Asia/Tashkent')::date
          -- A row still being worked on is not abandoned: a run that crossed midnight holds a
          -- lease (2026-09-25: a run finishing on the Mac was closed as "did not finish").
          and (notes->>'lease_until' is null or (notes->>'lease_until')::timestamptz < now())""")
    rows = api.query("""
        select id, finished_at, notes from tasnif.sync_runs
        where source = 'nightly'
          and (started_at at time zone 'Asia/Tashkent')::date = (now() at time zone 'Asia/Tashkent')::date
        order by id desc limit 1""")
    if rows:
        row = rows[0]
        notes = row["notes"] if isinstance(row["notes"], dict) else json.loads(row["notes"] or "{}")
        return {"id": row["id"], "finished": row["finished_at"] is not None, "notes": notes}
    now = api.query("select now()::text as t")[0]["t"]
    notes = {"since": now, "done": [], "summary": {}}
    run_id = api.query(
        f"insert into tasnif.sync_runs (source, notes) values ('nightly', {sql_json(notes)}) returning id")[0]["id"]
    print(f"tonight's run: {run_id} (changes since {now})", flush=True)
    return {"id": run_id, "finished": False, "notes": notes}


def save(api, night: dict) -> None:
    api.query(f"update tasnif.sync_runs set notes = {sql_json(night['notes'])} where id = {night['id']}")


def claim(api, night: dict, minutes: int) -> bool:
    """Take tonight's run for `minutes`, unless any sync, tonight's or an earlier night's, holds a lease.

    Two calls must never import at once: Vercel's next tick while a slow one is still going,
    or a laptop run while the cron fires. The lease lives in the run row and expires on its
    own, so a call that is killed mid-step blocks nobody for long.
    """
    # One sync at a time across all nights, not just this one: a laptop run that crosses
    # midnight holds yesterday's row while the cron opens today's. The advisory lock
    # serialises concurrent claims for the length of this one statement.
    rows = api.query(f"""
        with serialised as (select pg_advisory_xact_lock(hashtext('tasnif-nightly-sync')))
        update tasnif.sync_runs
        set notes = jsonb_set(notes, '{{lease_until}}', to_jsonb((now() + interval '{int(minutes)} minutes')::text))
        where id = {night['id']} and finished_at is null
          and (select true from serialised)
          and not exists (
            select 1 from tasnif.sync_runs other
            where other.source = 'nightly' and other.finished_at is null
              and (other.notes->>'lease_until')::timestamptz > now())
        returning notes->>'lease_until' as lease_until""")
    if not rows:
        return False
    night["notes"]["lease_until"] = rows[0]["lease_until"]
    return True


def renew(api, night: dict, minutes: int) -> bool:
    """Extend a lease this call holds (compare-and-set on its own expiry), for long laptop runs."""
    rows = api.query(f"""
        update tasnif.sync_runs
        set notes = jsonb_set(notes, '{{lease_until}}', to_jsonb((now() + interval '{int(minutes)} minutes')::text))
        where id = {night['id']} and notes->>'lease_until' = {sql_text(night['notes'].get('lease_until') or '')}
        returning notes->>'lease_until' as lease_until""")
    if not rows:
        return False
    night["notes"]["lease_until"] = rows[0]["lease_until"]
    return True


def changed_groups(api, since: str) -> list[str]:
    """Catalog groups with a code or tree node written since `since` (a database timestamp)."""
    rows = api.query(f"""
        select left(ikpu, 3) as g from tasnif.codes where updated_at >= {sql_text(since)}::timestamptz
        union
        select left(code, 3) from tasnif.nodes where updated_at >= {sql_text(since)}::timestamptz
        order by 1""")
    return [row["g"] for row in rows]


def worded_groups(api, since: str) -> list[str]:
    """Groups of category and service/cafe documents written since `since` that have everyday words."""
    rows = api.query(f"""
        select distinct left(key, 3) as g from tasnif.search_documents
        where updated_at >= {sql_text(since)}::timestamptz and everyday_terms is not null
          and (entity = 'node' or kind <> 'goods')
        order by 1""")
    return [row["g"] for row in rows]


def import_step(api, step: str, summary: dict, downloads: Downloads, force: bool) -> None:
    known = last_fingerprints(api)
    if step == "catalog":
        path = downloads.get("ru")
        digest = fingerprint(path)
        if not force and known.get("excel") == digest:
            summary["catalog"] = "unchanged"
            return
        codes, nodes, issues = import_catalog.parse(path)
        import_catalog.report(path, digest, codes, nodes, issues)
        summary["catalog"] = import_catalog.apply(api, path, digest, codes, nodes, issues,
                                                  batch_size=2000, pause=0.05, only_groups=None)
    elif step == "names":
        latn, cyrl = downloads.get("uz_latn"), downloads.get("uz_cyrl")
        catalog_imported = isinstance(summary.get("catalog"), dict)
        if not force and not catalog_imported and known.get("excel_uz") == fingerprint(latn, cyrl):
            summary["names"] = "unchanged"
            return
        summary["names"] = import_names.apply(api, latn, cyrl, pause=0.05)
    elif step == "inactive":
        path = downloads.get("inactive")
        if not force and known.get("inactive_excel") == fingerprint(path):
            summary["inactive"] = "unchanged"
            return
        summary["inactive"] = import_inactive.apply(api, path, pause=0.05)


def run(api, budget: Budget, force: bool = False) -> dict:
    """Carry tonight's run forward within `budget`; returns tonight's notes."""
    night = tonight(api)
    if night["finished"]:
        print("tonight's sync already finished", flush=True)
        return night["notes"]
    notes = night["notes"]
    notes.setdefault("done", [])
    summary = notes.setdefault("summary", {})
    # A Vercel call lives at most ~13 minutes, so its lease runs out before the next tick; a
    # laptop run renews a long one before every step.
    lease_minutes = 14 if budget.seconds else 90
    if not claim(api, night, lease_minutes):
        print("another call is working on tonight's run; leaving it alone", flush=True)
        return notes
    openai_key = os.environ.get("OPENAI_API_KEY")
    downloads = Downloads()
    try:
        for step in STEPS:
            if step in notes["done"]:
                continue
            if not budget.seconds and not renew(api, night, lease_minutes):
                raise RuntimeError("lost tonight's lease to another call")
            if not budget.allows(heavy=step in ("catalog", "names", "refresh")):
                print(f"leaving '{step}' for the next call ({budget.elapsed():.0f}s into this one)", flush=True)
                break
            print(f"step {step} ({budget.elapsed():.0f}s into this call)", flush=True)
            complete = True
            if step in ("catalog", "names", "inactive"):
                import_step(api, step, summary, downloads, force)
            elif step == "details":
                # About one code a second (three requests each, at the official API's 3 per second).
                limit = 100000 if budget.seconds is None else \
                    max(30, min(DETAILS_PER_CALL, int(budget.seconds - budget.elapsed())))
                result = fetch_details(api, "new", limit=limit)
                summary["details_written"] = summary.get("details_written", 0) + result["written"]
                complete = result["pending"] < limit
            elif step == "refresh":
                groups = changed_groups(api, notes["since"])
                summary["groups_rebuilt"] = groups
                summary["refresh"] = refresh(api, groups, chunk=REFRESH_CHUNK, pause=0.05)
            elif step == "words":
                if not openai_key:
                    raise RuntimeError("OPENAI_API_KEY is not set (everyday words for new entries)")
                terms = write_pending(api, openai_key)
                summary["everyday_words"] = summary.get("everyday_words", 0) + len(terms["written_keys"])
                # Documents include their everyday words, so the groups of every entry that got words
                # tonight are rebuilt. Taken from the data, not from this call's answers: a call that
                # wrote the words and then failed mid-rebuild leaves nothing pending to answer, and the
                # next call must still rebuild those groups.
                groups = worded_groups(api, notes["since"])
                if groups:
                    refresh(api, groups, chunk=REFRESH_CHUNK, pause=0.05)
            elif step == "embed":
                if not openai_key:
                    raise RuntimeError("OPENAI_API_KEY is not set (embeddings for changed documents)")
                summary["embeddings"] = embed_pending(api, openai_key)
            if complete:
                notes["done"].append(step)
            notes.pop("last_error", None)
            save(api, night)
            if not complete:
                break

        notes.pop("lease_until", None)
        if all(step in notes["done"] for step in STEPS):
            api.query(f"""update tasnif.sync_runs set finished_at = now(), error = null, notes = {sql_json(notes)}
                          where id = {night['id']}""")
            print(f"tonight's sync finished: {json.dumps(summary, ensure_ascii=False, default=str)}", flush=True)
        else:
            save(api, night)
        return notes
    except Exception as error:
        # Left open: the next call retries the step; the next night closes it if none succeeds.
        notes["last_error"] = f"{type(error).__name__}: {error}"[:1500]
        notes.pop("lease_until", None)
        save(api, night)
        raise
    finally:
        downloads.close()


def check(api) -> dict:
    """Download everything and say what tonight would import; write nothing."""
    known = last_fingerprints(api)
    downloads = Downloads()
    try:
        current = {
            "excel": fingerprint(downloads.get("ru")),
            "excel_uz": fingerprint(downloads.get("uz_latn"), downloads.get("uz_cyrl")),
            "inactive_excel": fingerprint(downloads.get("inactive")),
        }
    finally:
        downloads.close()
    new_codes = api.query("""
        select count(*)::int as n from tasnif.codes where details_fetched_at is null and status = 'active'
          and first_seen_at > (select finished_at from tasnif.sync_runs where source = 'excel' and error is null
                               and finished_at is not null and notes->>'only_groups' is null order by id limit 1)""")[0]["n"]
    return {"would_import": sorted(s for s, digest in current.items() if known.get(s) != digest),
            "new_codes_waiting_for_details": new_codes}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--check", action="store_true", help="download and compare fingerprints; write nothing")
    parser.add_argument("--force", action="store_true", help="import the exports even if their content is unchanged")
    parser.add_argument("--budget", type=float, help="stop starting steps after this many seconds, as on Vercel")
    args = parser.parse_args()

    api = database(args.project_ref)
    if args.check:
        print(json.dumps(check(api), ensure_ascii=False))
        return 0
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is not set (needed for everyday words and embeddings of new entries).")
    notes = run(api, Budget(args.budget), force=args.force)
    return 0 if all(step in notes.get("done", []) for step in STEPS) else 3


if __name__ == "__main__":
    sys.exit(main())
