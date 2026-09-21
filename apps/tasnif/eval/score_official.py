#!/usr/bin/env python3
"""Score the official IKPU search (tasnif.soliq.uz) against cases.jsonl.

    python3 apps/tasnif/eval/score_official.py            # cached answers first, fetch only what's missing
    python3 apps/tasnif/eval/score_official.py --refresh  # ask the site again for every case (~300 requests, ~6 min)

Writes results/official-<YYYY-MM-DD>.json (every case with what the site returned, plus the
summary) and prints the summary table.

What is measured, per case:

* main: the list the site shows as "Найдено совпадений". Text goes to `mxik/search-subposition`.
  Numbers go to the lookup the site offers for that kind of number (see `plan_requests`).
* suggestions: `elasticsearch/search`, the green "Возможно вы искали" button. The site fires it for
  every input, digits included, so every case gets it. Its answers are not stable: "капучино"
  returned 45 suggestions on 2026-09-16 and 2 on 2026-09-17, so compare suggestion scores across
  runs with care and check `answers_fetched` in the results file.

A case is hit at k when any of the first k returned codes is in `acceptable`, or starts with
`acceptable_prefix`. Three kinds of answer:

* results (HTTP 200): scored as returned; an empty list counts towards `main_zero_results`.
* rejected (HTTP 400): the site refuses the query itself. `search-subposition` only accepts
  letters, digits, hyphens and spaces, so "ko'k choy", "oʻquv", "1,5 л" or "10%" come back as
  400. The merchant sees nothing, so it counts as a miss and as a zero-result answer, and is
  cached like any other answer because asking again gives the same 400.
* errors (network failure, other statuses, non-JSON): a miss, reported under `errors`, never
  cached, so a rerun retries it.

Why it works the way it does:

* Python's TLS stack fails against tasnif.soliq.uz on this machine, so HTTP goes through `curl`.
* It is a public government service: at most one request every REQUEST_INTERVAL seconds, and every
  response is cached under .cache/official/ keyed by URL, so rerunning after an accountant edits
  `acceptable` codes re-scores without touching the site.
* English queries are sent with lang=ru: the site has no English, and a merchant typing English
  would most likely have the Russian interface open.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases.jsonl"
CACHE = HERE / ".cache" / "official"
RESULTS = HERE / "results"

API = "https://tasnif.soliq.uz/api/cls-api"
USER_AGENT = "tasnif.krafta.uz search benchmark (+https://tasnif.krafta.uz)"
REQUEST_INTERVAL = 1.2  # seconds between request starts; the agreed ceiling is 1 per second
MAIN_SIZE = 15
SUGGEST_SIZE = 20

API_LANG = {"ru": "ru", "uz_latn": "uz_latn", "uz_cyrl": "uz_cyrl", "en": "ru"}

_last_request_at = 0.0


def load_cases(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def url(endpoint: str, params: dict) -> str:
    return f"{API}/{endpoint}?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def plan_requests(case: dict) -> tuple[str, dict[str, tuple[str, str]]]:
    """Return (mode, {"main": (endpoint, url), "suggest": (endpoint, url)}) for a case.

    Numeric input is classified from the case itself, not guessed from its length alone
    (a 14-digit brand prefix and a 14-digit GTIN look the same):
      * `acceptable_prefix` set -> "prefix": main search with the digits. The site has no
        prefix search; its search box passes digit strings shorter than 18 to this endpoint.
      * 17 digits -> "ikpu": `mxik/search/by-params?mxikCode=`, the site's "search by IKPU" mode.
      * any other digits -> "barcode": `mxik/search/by-params?gtin=`, the site's barcode mode
        (radio option 4 in the site's product picker, and what its add-product form calls).
        The benchmark brief assumed barcodes go to elasticsearch; probing on 2026-09-17 showed
        elasticsearch returns nothing for barcodes or IKPU codes (4780069000154 -> 0 results)
        while `gtin` finds the product, so elasticsearch is kept as the suggestions column
        rather than scoring the official site on a lookup it does not use for barcodes.
    """
    query = case["query"]
    lang = API_LANG[case["lang"]]
    suggest = ("elasticsearch/search", url("elasticsearch/search", {
        "search": query, "size": SUGGEST_SIZE, "page": 0, "lang": lang}))
    main_search = ("mxik/search-subposition", url("mxik/search-subposition", {
        "search_text": query, "page": 0, "size": MAIN_SIZE, "lang": lang}))

    if not query.isdigit():
        return "text", {"main": main_search, "suggest": suggest}
    if case.get("mode") == "package":
        # A receipt's package code (e.g. 1218835). The site has no lookup for these, so
        # someone holding one can only type it into the main search box.
        return "package", {"main": main_search, "suggest": suggest}
    if case.get("acceptable_prefix"):
        return "prefix", {"main": main_search, "suggest": suggest}
    by_params = "mxik/search/by-params"
    if len(query) == 17:
        return "ikpu", {"main": (by_params, url(by_params, {
            "mxikCode": query, "size": MAIN_SIZE, "page": 0, "lang": lang})), "suggest": suggest}
    return "barcode", {"main": (by_params, url(by_params, {
        "gtin": query, "size": MAIN_SIZE, "page": 0, "lang": lang})), "suggest": suggest}


def fetch(request_url: str, refresh: bool) -> dict:
    """Return {"status", "body", "error", "fetched_at", "from_cache"} for one GET.

    200 and 400 answers with a JSON body are cached: a 400 is the site rejecting the query text,
    and asking again gives the same answer. Anything else is an error and is not cached.
    """
    global _last_request_at
    cache_file = CACHE / (hashlib.sha1(request_url.encode("utf-8")).hexdigest() + ".json")
    if cache_file.exists() and not refresh:
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        return {"status": cached["http_status"], "body": cached["body"], "error": None,
                "fetched_at": cached["fetched_at"], "from_cache": True}

    error = None
    for attempt in range(2):
        wait = REQUEST_INTERVAL - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()
        proc = subprocess.run(
            ["curl", "-s", "--max-time", "30", "-H", "Accept: application/json", "-A", USER_AGENT,
             "-w", "\n%{http_code}", request_url],
            capture_output=True)
        out = proc.stdout.decode("utf-8", errors="replace")
        body_text, _, status = out.rpartition("\n")
        if proc.returncode != 0:
            error = f"curl exit {proc.returncode}"
        elif status not in ("200", "400"):
            error = f"HTTP {status}"
        else:
            try:
                body = json.loads(body_text)
            except json.JSONDecodeError:
                error = f"HTTP {status} with a non-JSON body"
            else:
                now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
                CACHE.mkdir(parents=True, exist_ok=True)
                cache_file.write_text(json.dumps({
                    "url": request_url, "fetched_at": now, "http_status": int(status), "body": body,
                }, ensure_ascii=False), encoding="utf-8")
                return {"status": int(status), "body": body, "error": None, "fetched_at": now, "from_cache": False}
        # One retry for transient failures, after a longer pause.
        if attempt == 0 and (proc.returncode != 0 or status in ("429", "502", "503", "504")):
            time.sleep(5)
            continue
        break
    return {"status": None, "body": None, "error": error, "fetched_at": None, "from_cache": False}


def extract(endpoint: str, body: dict | None) -> tuple[list[str], list[dict], int]:
    """Return (codes in displayed order, first few items as {code, name}, total count)."""
    if not body:
        return [], [], 0
    data = body.get("data")
    if endpoint == "elasticsearch/search":  # {"data": [...], "recordTotal": n}
        items = data if isinstance(data, list) else []
        total = body.get("recordTotal") or len(items)
    else:  # Spring page: {"data": {"content": [...], "totalElements": n}}
        page = data if isinstance(data, dict) else {}
        items = page.get("content") or []
        total = page.get("totalElements") or len(items)
    codes = [str(it.get("mxikCode")) for it in items if it.get("mxikCode")]
    top = [{"code": str(it.get("mxikCode")), "name": it.get("mxikName") or it.get("name")} for it in items[:5]]
    return codes, top, total


def first_hit_rank(codes: list[str], case: dict) -> int | None:
    acceptable = set(case.get("acceptable") or [])
    prefix = case.get("acceptable_prefix")
    for rank, code in enumerate(codes, 1):
        if code in acceptable or (prefix and code.startswith(prefix)):
            return rank
    return None


def score_case(case: dict, refresh: bool) -> tuple[dict, int]:
    mode, requests = plan_requests(case)
    result = {
        "id": case["id"], "query": case["query"], "lang": case["lang"], "api_lang": API_LANG[case["lang"]],
        "category": case["category"], "mode": mode,
        "acceptable": case.get("acceptable") or [], "acceptable_prefix": case.get("acceptable_prefix"),
    }
    fetched = 0
    for slot, (endpoint, request_url) in requests.items():
        answer = fetch(request_url, refresh)
        fetched += 0 if answer["from_cache"] else 1
        rejected = None
        if answer["status"] == 400:
            rejected = (answer["body"] or {}).get("error") or "HTTP 400"
        codes, top, total = extract(endpoint, answer["body"] if answer["status"] == 200 else None)
        rank = first_hit_rank(codes, case)
        result[slot] = {
            "endpoint": endpoint, "url": request_url, "http_status": answer["status"],
            "fetched_at": answer["fetched_at"], "rejected": rejected, "error": answer["error"],
            "total": total, "codes": codes, "top": top,
            "first_hit_rank": rank,
            "top1": rank is not None and rank <= 1,
            "top3": rank is not None and rank <= 3,
        }
    return result, fetched


def summarize(results: list[dict]) -> dict:
    def block(rows: list[dict]) -> dict:
        n = len(rows)

        def rate(count: int) -> dict:
            return {"count": count, "rate": round(count / n, 3) if n else None}

        return {
            "cases": n,
            "main_top1": rate(sum(r["main"]["top1"] for r in rows)),
            "main_top3": rate(sum(r["main"]["top3"] for r in rows)),
            "suggest_top1": rate(sum(r["suggest"]["top1"] for r in rows)),
            "suggest_top3": rate(sum(r["suggest"]["top3"] for r in rows)),
            # Nothing shown to the merchant: an empty list or a rejected query (not a failed request).
            "main_zero_results": rate(sum(1 for r in rows if not r["main"]["error"] and not r["main"]["codes"])),
            "main_rejected": rate(sum(1 for r in rows if r["main"]["rejected"])),
            "suggest_rejected": rate(sum(1 for r in rows if r["suggest"]["rejected"])),
            "errors": sum(bool(r["main"]["error"]) + bool(r["suggest"]["error"]) for r in rows),
        }

    def grouped(key: str) -> dict:
        groups: dict[str, list[dict]] = {}
        for r in results:
            groups.setdefault(r[key], []).append(r)
        return {name: block(rows) for name, rows in groups.items()}

    return {
        "overall": block(results),
        "by_category": grouped("category"),
        "by_lang": grouped("lang"),
        "by_mode": grouped("mode"),
    }


def print_summary(summary: dict) -> None:
    def pct(cell: dict) -> str:
        return f"{cell['rate'] * 100:5.1f}%" if cell["rate"] is not None else "   -  "

    print(f"{'':16s} {'n':>4s}  {'main@1':>7s} {'main@3':>7s}  {'sugg@1':>7s} {'sugg@3':>7s}  "
          f"{'zero main':>9s} {'rejected':>8s}  {'err':>3s}")
    rows = [("overall", summary["overall"])]
    for section in ("by_category", "by_lang", "by_mode"):
        rows.append((None, None))
        rows.extend(summary[section].items())
    for name, s in rows:
        if name is None:
            print()
            continue
        print(f"{name:16s} {s['cases']:4d}  {pct(s['main_top1']):>7s} {pct(s['main_top3']):>7s}  "
              f"{pct(s['suggest_top1']):>7s} {pct(s['suggest_top3']):>7s}  "
              f"{pct(s['main_zero_results']):>9s} {pct(s['main_rejected']):>8s}  {s['errors']:3d}")
    print("\nzero main = nothing shown (empty list or rejected query); rejected = HTTP 400 on the query text")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--refresh", action="store_true", help="ignore cached responses and ask the site again")
    args = parser.parse_args()

    cases = load_cases(CASES)
    results, fetched = [], 0
    for i, case in enumerate(cases, 1):
        result, n = score_case(case, args.refresh)
        results.append(result)
        fetched += n
        # Progress line: 1 = hit at rank 1, 3 = hit at rank 2-3, - = miss in the top 3.
        marks = ["1" if result[s]["top1"] else "3" if result[s]["top3"] else "-" for s in ("main", "suggest")]
        print(f"[{i:3d}/{len(cases)}] {case['id']:12s} main {marks[0]} sugg {marks[1]}  {case['query']}",
              file=sys.stderr)

    summary = summarize(results)
    today = datetime.date.today().isoformat()
    fetched_at = sorted(r[s]["fetched_at"] for r in results for s in ("main", "suggest") if r[s]["fetched_at"])
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = RESULTS / f"official-{today}.json"
    out.write_text(json.dumps({
        "engine": "tasnif.soliq.uz",
        "run_date": today,
        "cases_file": CASES.name,
        # Answers can come from the cache, so this is when the site actually gave them.
        "answers_fetched": {"first": fetched_at[0] if fetched_at else None,
                            "last": fetched_at[-1] if fetched_at else None},
        "requests_sent_this_run": fetched,
        "notes": [
            "main: mxik/search-subposition for text and prefixes; mxik/search/by-params (mxikCode) for 17-digit codes; "
            "mxik/search/by-params (gtin) for barcodes.",
            "suggest: elasticsearch/search for every case.",
            "Rates are over all cases in the group. Rejected queries (HTTP 400) and failed requests count as misses; "
            "rejected queries also count as zero results.",
        ],
        "summary": summary,
        "cases": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print_summary(summary)
    print(f"\n{fetched} requests sent; results written to {out.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
