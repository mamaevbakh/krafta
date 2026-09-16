#!/usr/bin/env python3
"""Score tasnif.search() against the same cases as the official search.

    OPENAI_API_KEY=... pnpm --filter tasnif search:score                    # full hybrid search
    pnpm --filter tasnif search:score --no-embeddings --label words-only    # words and typos only

Writes results/tasnif-<YYYY-MM-DD>[-<label>].json and prints our top-1 / top-3 next to the
latest official run (results/official-*.json), overall and by category, language and mode.

Why it works the way it does:

* Hit logic, modes and case loading are imported from score_official.py, so both engines are
  graded by exactly the same rules: a case is hit at k when any of the first k codes is
  acceptable (or starts with `acceptable_prefix`).
* Queries are embedded with the model and size the documents were embedded with
  (scripts/embed_documents.py). Embeddings are cached under .cache/embeddings/, keyed by model
  and query, so rescoring after a ranking change costs nothing.
* The search runs in the database through the Management API, the same function the website
  and the agent will call.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "scripts"))
from score_official import CASES, RESULTS, first_hit_rank, load_cases, plan_requests  # noqa: E402
from import_catalog import ManagementApi, sql_text  # noqa: E402
from embed_documents import DIMENSIONS, MODEL, embed, openai_context  # noqa: E402

EMBED_CACHE = HERE / ".cache" / "embeddings"
TOP = 10


def query_embeddings(queries: list[str]) -> dict[str, list[float]]:
    EMBED_CACHE.mkdir(parents=True, exist_ok=True)

    def cache_path(query: str) -> Path:
        return EMBED_CACHE / (hashlib.sha256(f"{MODEL}:{DIMENSIONS}:{query}".encode()).hexdigest() + ".json")

    found = {q: json.loads(cache_path(q).read_text()) for q in queries if cache_path(q).exists()}
    missing = [q for q in dict.fromkeys(queries) if q not in found]
    if missing:
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise SystemExit("OPENAI_API_KEY is not set (or pass --no-embeddings).")
        vectors, _ = embed(missing, key, openai_context())
        for query, vector in zip(missing, vectors):
            cache_path(query).write_text(json.dumps(vector))
            found[query] = vector
    return found


def summarize(results: list[dict]) -> dict:
    def block(rows: list[dict]) -> dict:
        n = len(rows)

        def rate(count: int) -> dict:
            return {"count": count, "rate": round(count / n, 3) if n else None}

        return {"cases": n, "top1": rate(sum(r["top1"] for r in rows)), "top3": rate(sum(r["top3"] for r in rows)),
                "zero_results": rate(sum(1 for r in rows if not r["codes"]))}

    def grouped(key: str) -> dict:
        groups: dict[str, list[dict]] = {}
        for r in results:
            groups.setdefault(r[key], []).append(r)
        return {name: block(rows) for name, rows in sorted(groups.items())}

    return {"overall": block(results), "by_category": grouped("category"),
            "by_lang": grouped("lang"), "by_mode": grouped("mode")}


def latest_official() -> dict | None:
    runs = sorted(RESULTS.glob("official-*.json"))
    return json.loads(runs[-1].read_text(encoding="utf-8"))["summary"] if runs else None


def print_comparison(ours: dict, official: dict | None) -> None:
    def pct(cell: dict | None) -> str:
        return f"{cell['rate'] * 100:5.1f}%" if cell and cell["rate"] is not None else "    - "

    print(f"{'':14s} {'n':>4s}   {'ours@1':>7s} {'ours@3':>7s} {'nothing':>8s}   {'official@3':>10s}")
    sections = [("overall", {"overall": ours["overall"]}, {"overall": official["overall"]} if official else {})]
    sections += [(name, ours[name], official[name] if official else {}) for name in ("by_category", "by_lang", "by_mode")]
    for _, mine, theirs in sections:
        for group, s in mine.items():
            other = theirs.get(group) if theirs else None
            print(f"{group:14s} {s['cases']:4d}   {pct(s['top1']):>7s} {pct(s['top3']):>7s} {pct(s['zero_results']):>8s}"
                  f"   {pct(other['main_top3'] if other else None):>10s}")
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--no-embeddings", action="store_true", help="words and typos only")
    parser.add_argument("--label", help="suffix for the results file")
    args = parser.parse_args()

    cases = load_cases(CASES)
    api = ManagementApi(args.project_ref)
    vectors = {} if args.no_embeddings else query_embeddings([c["query"] for c in cases])

    results = []
    for number, case in enumerate(cases, start=1):
        mode, _ = plan_requests(case)
        vector = vectors.get(case["query"])
        embedding = (f"'[{','.join(f'{x:.5f}' for x in vector)}]'::extensions.halfvec({DIMENSIONS})"
                     if vector and mode == "text" else "null")
        rows = api.query(f"select ikpu, match, kind, is_branded, name_ru, score from tasnif.search("
                         f"{sql_text(case['query'])}, {embedding}, {TOP})")
        codes = [r["ikpu"] for r in rows]
        rank = first_hit_rank(codes, case)
        results.append({
            "id": case["id"], "query": case["query"], "lang": case["lang"], "category": case["category"],
            "mode": mode, "acceptable": case.get("acceptable"), "acceptable_prefix": case.get("acceptable_prefix"),
            "codes": codes, "top": rows[:5], "first_hit_rank": rank,
            "top1": rank is not None and rank <= 1, "top3": rank is not None and rank <= 3,
        })
        mark = "1" if rank == 1 else "3" if rank and rank <= 3 else "-"
        print(f"[{number:3d}/{len(cases)}] {case['id']:12s} {mark}  {case['query']}", file=sys.stderr)

    summary = summarize(results)
    today = datetime.date.today().isoformat()
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = RESULTS / f"tasnif-{today}{'-' + args.label if args.label else ''}.json"
    out.write_text(json.dumps({
        "engine": "tasnif.search", "run_date": today, "cases_file": CASES.name,
        "embeddings": None if args.no_embeddings else {"model": MODEL, "dimensions": DIMENSIONS},
        "summary": summary, "cases": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print_comparison(summary, latest_official())
    print(f"results written to {out.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
