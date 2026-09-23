"""Rebuild tasnif.search_documents from the catalog, in small statements.

    pnpm --filter tasnif search:refresh                  # everything
    pnpm --filter tasnif search:refresh --groups 102     # one group's nodes and codes

Run it after any catalog import (catalog:import, catalog:names), after the everyday-words
pass, and after any migration that changes how documents are built. It writes only
documents whose content changed and removes documents for codes that are no longer active,
so a rerun on an unchanged catalog writes nothing.

Why it works the way it does: kraftabase also serves Krafta's shops and payments, and one
class alone (concrete slabs, 06810) holds ~75k codes, so a whole group in one statement ran
past the statement timeout. Nodes go one group per call; codes go in IKPU ranges of about
--chunk codes; stale documents are removed in one pass at the end.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_catalog import database  # noqa: E402


def refresh(api, groups: list[str] | None = None, chunk: int = 10000, pause: float = 0.3) -> dict:
    """Rebuild the documents of `groups` (3-digit codes; None = the whole catalog), then drop stale ones."""
    if groups is None:
        groups = [row["code"] for row in api.query("select code from tasnif.nodes where level = 'group' order by code")]
        group_filter = ""
    else:
        groups = sorted(set(groups))
        if not all(g.isdigit() and len(g) == 3 for g in groups):
            raise ValueError(f"groups must be 3-digit codes, got {groups}")
        # No groups: only the stale-document sweep at the end runs.
        group_filter = "where left(ikpu, 3) in (" + ",".join(f"'{g}'" for g in groups) + ")" if groups else "where false"

    started = time.time()
    nodes = 0
    for group in groups:
        nodes += api.query(f"select tasnif.refresh_search_nodes('{group}') as n")[0]["n"]
        time.sleep(pause)
    print(f"nodes: {nodes} written across {len(groups)} groups, {time.time() - started:.0f}s", flush=True)

    ranges = api.query(f"""
        select min(ikpu) as lo, max(ikpu) as hi from (
          select ikpu, (row_number() over (order by ikpu) - 1) / {int(chunk)} as chunk
          from tasnif.codes {group_filter}
        ) x group by chunk order by chunk""")
    codes = 0
    for number, rng in enumerate(ranges, start=1):
        codes += api.query(f"select tasnif.refresh_search_codes('{rng['lo']}', '{rng['hi']}') as n")[0]["n"]
        if number % 5 == 0 or number == len(ranges):
            print(f"  codes: {number}/{len(ranges)} chunks, {codes} written, {time.time() - started:.0f}s", flush=True)
        time.sleep(pause)

    removed = api.query("select tasnif.remove_stale_search_documents() as n")[0]["n"]
    documents = api.query("""select count(*) filter (where entity = 'node')::int as nodes,
                                    count(*) filter (where entity = 'code')::int as codes,
                                    count(*) filter (where entity = 'node' or kind <> 'goods')::int as embeddable
                             from tasnif.search_documents""")[0]
    print(f"done in {time.time() - started:.0f}s: {nodes} nodes and {codes} codes written, {removed} removed; "
          f"documents now {documents}")
    return {"groups": len(groups), "nodes_written": nodes, "codes_written": codes, "removed": removed}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--groups", help="comma-separated 3-digit groups (default: the whole catalog)")
    parser.add_argument("--chunk", type=int, default=10000, help="codes per statement")
    parser.add_argument("--pause", type=float, default=0.3, help="seconds between statements")
    args = parser.parse_args()

    groups = [g.strip() for g in args.groups.split(",")] if args.groups else None
    try:
        refresh(database(args.project_ref), groups, args.chunk, args.pause)
    except ValueError as error:
        raise SystemExit(str(error)) from None


if __name__ == "__main__":
    main()
