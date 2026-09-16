"""Rebuild tasnif.search_documents from the catalog, one group at a time.

    pnpm --filter tasnif search:refresh               # all groups
    pnpm --filter tasnif search:refresh --groups 102  # just cafe/hotel services

Run it after any catalog import (catalog:import, catalog:names) and after the
everyday-words pass. It writes only documents whose content changed and removes
documents for codes that are no longer active, so a rerun on an unchanged
catalog writes nothing.

One database call per catalog group, with a pause between them: a full rebuild
is ~455k documents, and kraftabase also serves Krafta's shops and payments.
"""

from __future__ import annotations

import argparse
import collections
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_catalog import ManagementApi  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--groups", help="comma-separated 3-digit groups (default: every group in tasnif.nodes)")
    parser.add_argument("--pause", type=float, default=0.5, help="seconds between groups")
    args = parser.parse_args()

    api = ManagementApi(args.project_ref)
    if args.groups:
        groups = sorted({g.strip() for g in args.groups.split(",")})
    else:
        groups = [row["code"] for row in api.query("select code from tasnif.nodes where level = 'group' order by code")]

    started = time.time()
    totals = collections.Counter()
    for number, group in enumerate(groups, start=1):
        row = api.query(f"select * from tasnif.refresh_search_documents('{group}')")[0]
        totals.update(row)
        if any(row.values()):
            print(f"  {group}: {row}", flush=True)
        if number % 20 == 0:
            print(f"  {number}/{len(groups)} groups, {dict(totals)}, {time.time() - started:.0f}s", flush=True)
        time.sleep(args.pause)
    documents = api.query("""select count(*) filter (where entity = 'node')::int as nodes,
                                    count(*) filter (where entity = 'code')::int as codes,
                                    count(*) filter (where entity = 'node' or kind <> 'goods')::int as embeddable
                             from tasnif.search_documents""")[0]
    print(f"done in {time.time() - started:.0f}s: {dict(totals)}; documents now {documents}")


if __name__ == "__main__":
    main()
