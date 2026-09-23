"""Backfill what the Excel export lacks, one code at a time, from the official
per-code endpoint (tasnif.soliq.uz `cls-api/mxik/get/by-mxik`):

* Uzbek Latin and Cyrillic names, for codes and tree nodes that have none (the Uzbek
  Excel exports, import_names.py, are the source of names; this only fills gaps);
* numeric package codes, which a fiscal receipt needs next to the IKPU
  (10202001010000002 cafe coffee drinks -> 1747305 "1 шт. (кружка/стакан)");
* benefit (льгота) names, where the export only has an ID.

    # Dry run: fetch a few codes, print what would be written. Only reads the database.
    pnpm --filter tasnif catalog:backfill --limit 5

    # Cafe, service and category-level codes (~8k), politely.
    pnpm --filter tasnif catalog:backfill --apply --scope core

    # Codes the nightly sync added (run by scripts/sync_catalog.py).
    pnpm --filter tasnif catalog:backfill --apply --scope new

Why it works the way it does:

* It is a public government service, so the rate is capped (default 3 requests
  per second across all workers, each code costs 3 requests: ru, uz_latn,
  uz_cyrl) and every request identifies itself. Scope `core` covers what small
  businesses search for and finishes in about an hour; `all` is a multi-day job
  worth replacing with a bulk route before anyone runs it.
* tasnif.soliq.uz's certificate chain isn't in certifi's bundle, but it is in
  the macOS trust store, hence `truststore`.
* A code is only marked fetched after all three languages returned 200. A
  network error leaves it pending for the next run; an explicit empty answer
  marks it fetched with no data, so a code the official side no longer knows
  can't be retried forever.
* Packages for a code are replaced as a set, so a package the tax committee
  removed disappears here too.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import http.client
import json
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_catalog import database, sql_json  # noqa: E402

OFFICIAL = "https://tasnif.soliq.uz/api/cls-api/mxik/get/by-mxik"
LANGS = ("ru", "uz_latn", "uz_cyrl")
NODE_FIELDS = (("groupCode", "groupName"), ("classCode", "className"),
               ("positionCode", "positionName"), ("subPositionCode", "subPositionName"))

SCOPES = {
    # Cafe and service codes, plus category-level goods codes (no brand, no attribute).
    "core": "(kind in ('catering', 'service') or right(ikpu, 6) = '000000')",
    "generic": "(kind in ('catering', 'service') or not is_branded)",
    # Codes that appeared after the first full import: what the nightly sync brings in. Their
    # package codes exist only here (the units export needs a captcha), so all of them, branded
    # or not. Small: a few hundred a month.
    "new": """(first_seen_at > (select finished_at from tasnif.sync_runs
                          where source = 'excel' and error is null and finished_at is not null
                            and notes->>'only_groups' is null
                          order by id limit 1))""",
    "all": "true",
}


def official_context() -> ssl.SSLContext:
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        return ssl.create_default_context()


class RateLimiter:
    def __init__(self, per_second: float) -> None:
        self.interval = 1.0 / per_second
        self.lock = threading.Lock()
        self.next_slot = time.monotonic()

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            slot = max(now, self.next_slot)
            self.next_slot = slot + self.interval
        time.sleep(max(0.0, slot - now))


class NotFound(Exception):
    pass


def fetch(ikpu: str, lang: str, limiter: RateLimiter, context: ssl.SSLContext, attempts: int = 4) -> dict:
    url = f"{OFFICIAL}?{urllib.parse.urlencode({'mxikCode': ikpu, 'lang': lang})}"
    for attempt in range(1, attempts + 1):
        limiter.wait()
        request = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "tasnif.krafta.uz catalog backfill (+https://tasnif.krafta.uz)",
        })
        try:
            with urllib.request.urlopen(request, timeout=30, context=context) as response:
                body = response.read()
            data = json.loads(body) if body.strip() else None
            if not data or not isinstance(data, dict) or data.get("mxikCode") != ikpu:
                raise NotFound(ikpu)
            return data
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise NotFound(ikpu) from None
            if error.code not in (429,) and error.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException,
                json.JSONDecodeError):
            pass
        time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f"{ikpu} {lang}: gave up after {attempts} attempts")


def text(value: object) -> str | None:
    if value is None:
        return None
    value = " ".join(str(value).split())
    return value or None


def collect(ikpu: str, limiter: RateLimiter, context: ssl.SSLContext) -> dict:
    try:
        by_lang = {lang: fetch(ikpu, lang, limiter, context) for lang in LANGS}
    except NotFound:
        return {"ikpu": ikpu, "found": False}
    ru, latn, cyrl = (by_lang[lang] for lang in LANGS)

    nodes = []
    for code_field, name_field in NODE_FIELDS:
        code = text(ru.get(code_field))
        if code and code.isdigit() and len(code) in (3, 5, 8, 11) and ikpu.startswith(code):
            nodes.append({"code": code, "name_uz_latn": text(latn.get(name_field)),
                          "name_uz_cyrl": text(cyrl.get(name_field))})

    names = {lang: {p.get("code"): text(p.get("name")) for p in (by_lang[lang].get("packages") or [])}
             for lang in LANGS}
    packages, seen = [], set()
    for package in ru.get("packages") or []:
        code = package.get("code")
        if not isinstance(code, int) or code in seen:
            continue
        seen.add(code)
        packages.append({
            "ikpu": ikpu,
            "package_code": code,
            "parent_package_code": package.get("parentCode") if isinstance(package.get("parentCode"), int) else None,
            "name_ru": names["ru"].get(code),
            "name_uz_latn": names["uz_latn"].get(code),
            "name_uz_cyrl": names["uz_cyrl"].get(code),
            "container_name_ru": text(package.get("containerName")),
            "unit_name_ru": text(package.get("unitName")),
            "parent_value": package.get("parentValue") if isinstance(package.get("parentValue"), (int, float)) else None,
            "package_type": text(package.get("type")),
            "is_unit_package": text(package.get("isUnitPackage")),
        })

    return {
        "ikpu": ikpu,
        "found": True,
        "name_uz_latn": text(latn.get("mxikName")),
        "name_uz_cyrl": text(cyrl.get("mxikName")),
        "benefit_name_ru": text(ru.get("lgotaName")),
        "nodes": nodes,
        "packages": packages,
    }


def write(api, records: list[dict]) -> None:
    codes = [{k: r.get(k) for k in ("ikpu", "name_uz_latn", "name_uz_cyrl", "benefit_name_ru")} for r in records]
    nodes = {n["code"]: n for r in records if r["found"] for n in r["nodes"]}
    packages = [p for r in records if r["found"] for p in r["packages"]]
    found = [r["ikpu"] for r in records if r["found"]]
    # One request = one implicit transaction: a code is never marked fetched
    # without its names and packages landing with it.
    #
    # Uzbek names only fill gaps. The Uzbek Excel exports (import_names.py) are the source of
    # names; this endpoint spells some of the same names differently (typographic apostrophes
    # in group names), and letting it overwrite them renamed eleven whole groups on 2026-09-23,
    # which changed the embedded text of 5,755 documents under them for nothing, and would have
    # flipped back at the next Uzbek import.
    api.query(f"""
        update tasnif.codes c
        set name_uz_latn = coalesce(c.name_uz_latn, i.name_uz_latn),
            name_uz_cyrl = coalesce(c.name_uz_cyrl, i.name_uz_cyrl),
            benefit_name_ru = coalesce(i.benefit_name_ru, c.benefit_name_ru),
            details_fetched_at = now(), updated_at = now()
        from jsonb_to_recordset({sql_json(codes)})
          as i(ikpu text, name_uz_latn text, name_uz_cyrl text, benefit_name_ru text)
        where c.ikpu = i.ikpu;

        update tasnif.nodes n
        set name_uz_latn = coalesce(n.name_uz_latn, i.name_uz_latn),
            name_uz_cyrl = coalesce(n.name_uz_cyrl, i.name_uz_cyrl),
            updated_at = now()
        from jsonb_to_recordset({sql_json(list(nodes.values()))})
          as i(code text, name_uz_latn text, name_uz_cyrl text)
        where n.code = i.code
          and ((n.name_uz_latn is null and i.name_uz_latn is not null)
               or (n.name_uz_cyrl is null and i.name_uz_cyrl is not null));

        delete from tasnif.packages
        where ikpu in (select jsonb_array_elements_text({sql_json(found)}));

        insert into tasnif.packages (ikpu, package_code, parent_package_code, name_ru, name_uz_latn,
          name_uz_cyrl, container_name_ru, unit_name_ru, parent_value, package_type, is_unit_package)
        select ikpu, package_code, parent_package_code, name_ru, name_uz_latn, name_uz_cyrl,
          container_name_ru, unit_name_ru, parent_value, package_type, is_unit_package
        from jsonb_to_recordset({sql_json(packages)}) as t(ikpu text, package_code bigint,
          parent_package_code bigint, name_ru text, name_uz_latn text, name_uz_cyrl text,
          container_name_ru text, unit_name_ru text, parent_value numeric, package_type text,
          is_unit_package text)
        on conflict (ikpu, package_code) do nothing;
    """)


def fetch_details(api, scope: str, limit: int = 100000, rate: float = 3.0, workers: int = 3,
                  batch: int = 50, apply: bool = True) -> dict:
    pending = [row["ikpu"] for row in api.query(f"""
        select ikpu from tasnif.codes
        where details_fetched_at is null and status = 'active' and {SCOPES[scope]}
        order by case kind when 'catering' then 0 when 'service' then 1 else 2 end,
                 right(ikpu, 6) <> '000000', is_branded, ikpu
        limit {int(limit)}""")]
    print(f"{len(pending)} codes pending in scope '{scope}'", flush=True)
    if not pending:
        return {"pending": 0, "written": 0, "not_found": 0, "failed": 0}

    limiter, context = RateLimiter(rate), official_context()
    run_id = None
    if apply:
        run_id = api.query(
            "insert into tasnif.sync_runs (source, rows_seen, notes) values "
            f"('details_api', {len(pending)}, {sql_json({'scope': scope, 'rate': rate})}) returning id"
        )[0]["id"]

    done = not_found = failed = 0
    buffer: list[dict] = []
    started = time.time()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(collect, ikpu, limiter, context): ikpu for ikpu in pending}
            for future in concurrent.futures.as_completed(futures):
                try:
                    record = future.result()
                except Exception as error:  # left pending; the next run retries it
                    failed += 1
                    print(f"  failed {futures[future]}: {error}", flush=True)
                    continue
                not_found += 0 if record["found"] else 1
                if not apply:
                    print(json.dumps(record, ensure_ascii=False)[:1500], flush=True)
                    done += 1
                    continue
                buffer.append(record)
                if len(buffer) >= batch:
                    write(api, buffer)
                    done += len(buffer)
                    buffer = []
                    speed = done / max(1.0, time.time() - started)
                    print(f"  {done}/{len(pending)} written, {not_found} not found, {failed} failed, "
                          f"{speed:.2f} codes/s", flush=True)
            if buffer:
                write(api, buffer)
                done += len(buffer)
    finally:
        if run_id is not None:
            api.query(f"""update tasnif.sync_runs set finished_at = now(), rows_changed = {done},
                notes = notes || {sql_json({'not_found': not_found, 'failed': failed})} where id = {run_id}""")
    print(f"done: {done} codes, {not_found} not found upstream, {failed} failed, {time.time() - started:.0f}s")
    return {"pending": len(pending), "written": done, "not_found": not_found, "failed": failed}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to the database (default: dry run)")
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--scope", choices=SCOPES, default="core")
    parser.add_argument("--limit", type=int, default=100000)
    parser.add_argument("--rate", type=float, default=3.0, help="official API requests per second, all workers")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--batch", type=int, default=50, help="codes per database write")
    args = parser.parse_args()
    fetch_details(database(args.project_ref), args.scope, args.limit, args.rate, args.workers, args.batch, args.apply)


if __name__ == "__main__":
    main()
