"""Import the tax committee's list of switched-off (deactivated) IKPU codes.

    pnpm --filter tasnif catalog:inactive --file ~/Downloads/inactiveMxik_ru.xlsx
    pnpm --filter tasnif catalog:inactive --file ~/Downloads/inactiveMxik_ru.xlsx --apply

The file is a public homepage download:
https://tasnif.soliq.uz/api/cls-api/excel/get/inactive-mxik?lang=ru

Why it works the way it does:

* People paste codes from old invoices and supplier paperwork. For a switched-off
  code the useful answer is "switched off; here are active codes in the same
  category", so the list is kept in full in tasnif.inactive_codes.
* The list has no deactivation date. `first_listed_at` records when this copy
  first saw a code on it, which is the best date available.
* Nothing is ever deleted from here. If a code comes back to life it simply
  reappears in the active catalog, and the active row wins wherever both exist.
* Rows are upserted in batches with `is distinct from` guards, so re-importing an
  unchanged list writes nothing.
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_catalog import (  # noqa: E402
    HIERARCHY_CELL, IKPU, NODE_LENGTHS, batched, clean, database, fingerprint, sql_json, sql_text,
)

HEADER = ["Группа", "Класс", "Позиция", "Субпозиция", "Бренд", "Атрибут", "ИКПУ", "Название ИКПУ"]
# In this export a missing brand is "<14 digits>---" (no space), a named one "<14 digits>-<name>".
BRAND = re.compile(r"^\d{14}-(?!--$)(.+)$", re.S)
FIELDS = ["ikpu", "name_ru", "group_name_ru", "class_name_ru", "position_name_ru", "subposition_name_ru",
          "brand_name", "attribute_ru"]


def parse(path: Path) -> tuple[list[dict], collections.Counter]:
    from openpyxl import load_workbook

    rows = load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)
    header = [clean(c) for c in next(rows)][:8]
    if header != HEADER:
        raise SystemExit(f"{path.name}: header is {header}, expected {HEADER}; refusing to guess.")
    next(rows)  # empty second header row

    codes: dict[str, dict] = {}
    counts = collections.Counter()
    for raw in rows:
        cells = (list(raw) + [None] * 8)[:8]
        ikpu = clean(cells[6])
        if ikpu is None or not IKPU.match(ikpu):
            if any(clean(c) for c in cells):
                counts["unreadable_row"] += 1
            continue
        name = clean(cells[7])
        if name is None:
            counts["missing_name"] += 1
            continue
        if ikpu in codes:
            counts["duplicate_ikpu"] += 1
            continue
        record = {"ikpu": ikpu, "name_ru": name}
        for index, (length, field) in enumerate(zip(NODE_LENGTHS, FIELDS[2:6])):
            match = HIERARCHY_CELL.match(str(cells[index] or ""))
            record[field] = clean(match.group(2)) if match and match.group(1) == ikpu[:length] else None
            if record[field] is None:
                counts[f"no_{field}"] += 1
        brand = BRAND.match(str(cells[4] or "").strip())
        record["brand_name"] = clean(brand.group(1)) if brand else None
        attribute = clean(cells[5])
        record["attribute_ru"] = None if attribute in (None, "---") else attribute
        codes[ikpu] = record
    return list(codes.values()), counts


def apply(api, path: Path, pause: float = 0.3) -> dict:
    started = time.time()
    records, counts = parse(path)
    print(f"{len(records)} switched-off codes; {dict(counts)}; branded {sum(1 for r in records if r['brand_name'])}")
    print(f"parsed in {time.time() - started:.1f}s", flush=True)

    digest = fingerprint(path)
    run_id = api.query(
        "insert into tasnif.sync_runs (source, source_file, source_sha256, rows_seen, notes) values "
        f"('inactive_excel', {sql_text(path.name)}, '{digest}', {len(records)}, {sql_json(counts)}) returning id"
    )[0]["id"]

    columns = ", ".join(f"{field} text" for field in FIELDS)
    updates = ", ".join(f"{field} = excluded.{field}" for field in FIELDS[1:])
    differs = " or ".join(f"i.{field} is distinct from excluded.{field}" for field in FIELDS[1:])
    totals = collections.Counter()
    try:
        for number, chunk in enumerate(batched(records, 5000, max_bytes=600_000), start=1):
            result = api.query(f"""
                with written as (
                  insert into tasnif.inactive_codes as i ({", ".join(FIELDS)})
                  select {", ".join(FIELDS)} from jsonb_to_recordset({sql_json(chunk)}) as t({columns})
                  on conflict (ikpu) do update set {updates}, updated_at = now()
                  where {differs}
                  returning (xmax = 0) as inserted
                )
                select count(*) filter (where inserted)::int as added,
                       count(*) filter (where not inserted)::int as changed
                from written""")
            totals["added"] += result[0]["added"]
            totals["changed"] += result[0]["changed"]
            if number % 20 == 0:
                print(f"  {dict(totals)}", flush=True)
            time.sleep(pause)
        # Sanity check worth failing loudly on: the committee's two lists should never overlap.
        overlap = api.query("""select count(*)::int as n from tasnif.inactive_codes i
                               join tasnif.codes c on c.ikpu = i.ikpu and c.status = 'active'""")[0]["n"]
        print(f"inactive codes: {dict(totals)}; also active in tasnif.codes: {overlap}")
        api.query(f"""update tasnif.sync_runs set finished_at = now(), rows_added = {totals['added']},
            rows_changed = {totals['changed']}, notes = notes || {sql_json({'also_active': overlap})}
            where id = {run_id}""")
    except Exception as error:
        api.query(f"update tasnif.sync_runs set finished_at = now(), error = {sql_text(str(error)[:2000])} where id = {run_id}")
        raise
    print(f"done in {time.time() - started:.1f}s")
    return {"run_id": run_id, "also_active": overlap, **totals}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--apply", action="store_true", help="write to the database (default: dry run)")
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--pause", type=float, default=0.3, help="seconds between database requests")
    args = parser.parse_args()

    path = args.file.expanduser()
    if not args.apply:
        started = time.time()
        records, counts = parse(path)
        print(f"{len(records)} switched-off codes; {dict(counts)}; branded {sum(1 for r in records if r['brand_name'])}")
        print(f"parsed in {time.time() - started:.1f}s")
        print("dry run: nothing written (pass --apply to import)")
        return
    apply(database(args.project_ref), path, args.pause)


if __name__ == "__main__":
    main()
