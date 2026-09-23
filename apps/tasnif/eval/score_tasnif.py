#!/usr/bin/env python3
"""Score tasnif.search() against the same cases as the official search.

    OPENAI_API_KEY=... pnpm --filter tasnif search:score                    # full hybrid search
    pnpm --filter tasnif search:score --no-embeddings --label words-only    # words and typos only
    pnpm --filter tasnif search:score --migration ../../supabase/migrations/<file>.sql --label v3-candidate

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
* --migration scores a search change before it is applied. There is no dev database, so each
  batch of cases runs in one DO block that first executes the migration file, then the searches,
  then raises: the error carries the results out and the transaction, migration included, rolls
  back. The block's own variables have long names (score_case, score_report) because inside a
  DO block a PL/pgSQL variable shadows a table alias of the same name in the migration's SQL. Batches are kept small (MIGRATION_BATCH) to finish inside the API's ~100 s limit and
  its ~1 MB request limit (query vectors are ~12 KB each).
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "scripts"))
from score_official import CASES, RESULTS, first_hit_rank, load_cases, plan_requests  # noqa: E402
from import_catalog import ManagementApi, sql_text  # noqa: E402
from embed_documents import DIMENSIONS, MODEL, embed, openai_context  # noqa: E402

EMBED_CACHE = HERE / ".cache" / "embeddings"
TOP = 10
# Cases per request with --migration. The API gives up after ~100 s (HTTP 524); the migration's
# index builds take ~30 s of that and a search on a cache they just flushed ~1.5 s.
MIGRATION_BATCH = 20


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


def vector_sql(vector: list[float] | None) -> str:
    if not vector:
        return f"null::extensions.halfvec({DIMENSIONS})"
    return f"'[{','.join(f'{x:.5f}' for x in vector)}]'::extensions.halfvec({DIMENSIONS})"


def search_live(api: ManagementApi, query: str, vector: list[float] | None) -> list[dict]:
    return api.query(f"select ikpu, match, kind, is_branded, name_ru, score from tasnif.search("
                     f"{sql_text(query)}, {vector_sql(vector)}, {TOP})")


def search_with_migration(api: ManagementApi, migration: str, batch: list[tuple[str, str, list[float] | None]]) -> dict:
    """Run `batch` (id, query, vector) against the search as `migration` would leave it, then roll back."""
    values = ",\n".join(f"({sql_text(cid)}, {sql_text(query)}, {vector_sql(vector)})" for cid, query, vector in batch)
    # The migration's index builds read the whole documents table, which on kraftabase's disk can
    # take most of the API's default two-minute statement limit on their own.
    block = f"""set statement_timeout = '15min';
do $score$
declare score_report jsonb := '{{}}'::jsonb; score_case record;
begin
{migration}
for score_case in select * from (values {values}) as v(id, q, e) loop
  score_report := score_report || jsonb_build_object(score_case.id, coalesce((
    select jsonb_agg(jsonb_build_object('ikpu', s.ikpu, 'match', s.match, 'kind', s.kind,
      'is_branded', s.is_branded, 'name_ru', s.name_ru, 'score', s.score) order by s.n)
    from tasnif.search(score_case.q, score_case.e, {TOP}) with ordinality
      as s(ikpu, status, match, kind, is_branded, name_ru, name_uz_latn, name_uz_cyrl, subposition_code, score, n)),
    '[]'::jsonb));
end loop;
raise exception 'SCORE_REPORT %', score_report;
end
$score$;"""
    request = urllib.request.Request(api.url, data=json.dumps({"query": block}).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {api.token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=600, context=api.context) as response:
            raise RuntimeError(f"the scoring block did not raise: {response.read()[:300]!r}")
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", "replace")
    try:
        message = json.loads(message).get("message", message)
    except json.JSONDecodeError:
        pass
    if "SCORE_REPORT" not in message:
        raise RuntimeError(f"migration or search failed: {message[:3000]}")
    return json.loads(message.split("SCORE_REPORT", 1)[1].split("\nCONTEXT")[0].strip())


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
    parser.add_argument("--cases", type=Path, default=CASES, help="cases file (default: the reviewed benchmark)")
    parser.add_argument("--migration", type=Path, help="score as this migration file would leave the search, then roll back")
    parser.add_argument("--batch", type=int, default=MIGRATION_BATCH,
                        help="cases per rolled-back request with --migration (lower it for slow migrations)")
    args = parser.parse_args()

    cases = load_cases(args.cases)
    api = ManagementApi(args.project_ref)
    vectors = {} if args.no_embeddings else query_embeddings([c["query"] for c in cases])

    def vector_for(case: dict) -> list[float] | None:
        return vectors.get(case["query"]) if plan_requests(case)[0] == "text" else None

    answers: dict[str, list[dict]] = {}
    if args.migration:
        migration = args.migration.read_text(encoding="utf-8")
        batch: list[tuple[str, str, list[float] | None]] = []
        for number, case in enumerate(cases, start=1):
            batch.append((case["id"], case["query"], vector_for(case)))
            if len(batch) == args.batch or number == len(cases):
                answers.update(search_with_migration(api, migration, batch))
                print(f"[{number:3d}/{len(cases)}] scored with {args.migration.name}", file=sys.stderr)
                batch = []

    results = []
    for number, case in enumerate(cases, start=1):
        mode, _ = plan_requests(case)
        rows = answers[case["id"]] if args.migration else search_live(api, case["query"], vector_for(case))
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
        "engine": "tasnif.search", "run_date": today, "cases_file": args.cases.name,
        "migration": args.migration.name if args.migration else None,
        "embeddings": None if args.no_embeddings else {"model": MODEL, "dimensions": DIMENSIONS},
        "summary": summary, "cases": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    # The official column only means something on the benchmark the official run scored.
    print_comparison(summary, latest_official() if args.cases.resolve() == CASES.resolve() else None)
    print(f"results written to {out.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
