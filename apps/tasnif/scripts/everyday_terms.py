"""Write the everyday words people use for each catalog category (one-time AI pass).

    OPENAI_API_KEY=... pnpm --filter tasnif search:terms --keys 02004001004,08517001001   # try a few, print only
    OPENAI_API_KEY=... pnpm --filter tasnif search:terms --apply                           # everything still missing
    OPENAI_API_KEY=... pnpm --filter tasnif search:terms --menu [--apply]                  # redo the cafe menu entries

Why this exists: the catalog names things the way a customs tariff does. Smartphones are
"Сотовые телефоны, радиотелефоны", Lay's chips sit under "Не замороженные овощи, приготовленные
или консервированные…", a cappuccino is "Безалкогольные напитки, кофе и кофесодержащие напитки,
приготовленные в заведении общественного питания". Nobody types that. For every tree node and
every service/cafe code this pass stores the words a merchant or accountant would actually type,
in Russian, Uzbek (Latin) and English, in tasnif.search_documents.everyday_terms. Documents and
embeddings then include them (run search:refresh and search:embed afterwards).

Why it works the way it does:

* The model sees the full category path and, for categories, a few real entries underneath
  (product names or child categories), so "Не замороженные овощи, приготовленные…" is judged by
  what is actually filed there (crisps), not by its title alone.
* It is told to leave a list short or empty rather than guess, and never to name things that
  belong to a sibling category. The terms only steer ranking; results always show the official
  name, so a wrong term costs a worse ranking, not a wrong code on a receipt.
* Structured output (JSON schema, strict) and a per-item `key` echo, so answers can't drift onto
  the wrong row. Items whose key doesn't come back are left pending for the next run.
* gpt-5.4-mini with low reasoning effort: ~15k entries is ~600 requests of 25 entries each.

The cafe menu (class 10202, 74 entries) gets its own pass, `--menu`. Cafes are who this site is
for, and the general pass left their vocabulary thin: at 8 words a language, "Основные блюда, с
мясом" had no шашлык and no osh, and самса landed under bread because the model saw that entry
without its siblings. The menu pass sends each section's entries together, so every dish is
placed once against the catalog's own split, allows 25 words a language, and asks for the
spellings people actually type (шаурма and шаверма, самса and сомса), with the stronger model.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import functools
import http.client
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_catalog import ManagementApi, batched, sql_json  # noqa: E402

MODEL = "gpt-5.4-mini"

INSTRUCTIONS = """You help small businesses in Uzbekistan find the tax classification code (IKPU / MXIK) for what they sell.

For each catalog entry you receive, list the everyday words a shop owner, cafe owner, service provider or accountant would actually type into a search box when looking for this entry: common product or service names, dish and drink names, colloquial and trade names, well-known generic names. Give them in Russian ("ru"), Uzbek in Latin script ("uz") and English ("en").

Rules:
- Only words for things that genuinely belong to THIS entry. If something belongs to a neighbouring entry, leave it out.
- Prefer the most common names first. At most 8 words or short phrases per language.
- Entries under "Услуги общественного питания" / catering are food and drinks prepared and served in cafes and restaurants: use menu item names as served in Uzbekistan (e.g. плов, лагман, самса, капучино, латте). Retail entries are packaged goods sold in shops: use product types (e.g. чипсы, растворимый кофе 3 в 1).
- Services: describe the service the way a customer or provider says it (e.g. стрижка, маникюр, ремонт телефона).
- Broad entries (group, class) get only broad category words.
- Do not repeat the official name word for word, do not add brand names, codes, units, or spelling mistakes.
- If you are not confident what belongs here, return empty lists. Empty is better than wrong.
- Echo each entry's "key" exactly."""

MENU_MODEL = "gpt-5.4"

MENU_INSTRUCTIONS = """You help cafes and restaurants in Uzbekistan find the tax classification code (IKPU / MXIK) for every item on their menu and every extra they charge for.

You receive all catalog entries of one section of the catering class ("Услуги общественного питания"), siblings together. For each entry, list what a cafe owner, cashier or accountant would type into a search box for the things that belong to it: menu items and drinks as they are written on menus and receipts in Uzbekistan (Uzbek, Russian, Central Asian, Caucasian, Turkish, Asian, European and fast-food dishes alike), and the charges and services as they appear on receipts and price lists.

Rules:
- Put each dish or drink under the ONE entry an accountant would use for it, following the split the catalog makes: by main ingredient (meat, poultry, fish and seafood, vegetables/grains/pasta, dough, eggs), and by course (snacks, salads, soups, sides and sauces, bread, desserts, teas, coffee, other soft drinks, cocktails). Dough-based dishes (dumplings, baked filled pastries, noodles served as a main) belong to the dough-based main dishes, not to bread; bread is flatbreads, loaves and buns.
- Menu sections: be exhaustive, up to 25 items per language, most common first. Include regional names and the alternative spellings people really use on menus and in messages: Uzbek colloquial forms, Russian spellings of Uzbek dishes, common Russian variants, English menu names. People search the way they write.
- Uzbek ("uz") in Latin script, with apostrophes as usually written (o', g').
- Charges and services (table or room rent, service charge, deposit, entry fee, reservations, delivery, hookah, takeaway packaging, damage, catering, weddings and banquets, music, host, decoration, shows): the words used on receipts, price lists and in contracts, up to 12 per language.
- Broad entries (the class, a position) get only broad words.
- No brand names, prices or units. Empty lists are better than wrong ones.
- Echo each entry's "key" exactly."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["items"],
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["key", "ru", "uz", "en"],
                "properties": {
                    "key": {"type": "string"},
                    "ru": {"type": "array", "items": {"type": "string"}},
                    "uz": {"type": "array", "items": {"type": "string"}},
                    "en": {"type": "array", "items": {"type": "string"}},
                },
            },
        }
    },
}


def load_entries(api: ManagementApi, keys: list[str] | None, redo: bool, limit: int) -> list[dict]:
    where = "true"
    if keys:
        where = "d.key in (" + ",".join("'" + k.replace("'", "") + "'" for k in keys if k.isdigit()) + ")"
    pending = "" if redo or keys else "and d.everyday_terms is null"
    rows, last = [], ""
    while True:
        # For categories, show what is really filed underneath: a few code names for
        # sub-positions, child category names for everything above.
        chunk = api.query(f"""
            select d.key, d.level, d.kind, e.embed_text as path,
              case
                -- Sub-positions: products spread evenly across the whole category (the first
                -- few by code can all be the odd ones out: "vegetable purée" under the heading
                -- where Lay's lives), then its most common brands, which say more than any title.
                when d.level = 'subposition' then concat_ws(' || brands: ',
                  (select string_agg(x.name_ru, ' | ') from (
                     select c.name_ru, row_number() over (order by c.ikpu) as rn, count(*) over () as n
                     from tasnif.codes c where c.subposition_code = d.key and c.status = 'active'
                   ) x where x.rn % greatest(1, x.n / 6) = 1),
                  (select string_agg(b.brand_name, ', ') from (
                     select c.brand_name from tasnif.codes c
                     where c.subposition_code = d.key and c.status = 'active' and c.brand_name is not null
                     group by c.brand_name order by count(*) desc, c.brand_name limit 8
                   ) b))
                when d.entity = 'node' then (
                  select string_agg(x.name_ru, ' | ') from (
                    select n.name_ru from tasnif.nodes n where n.parent_code = d.key order by n.code limit 10
                  ) x)
              end as examples
            from tasnif.search_documents d
            join tasnif.embedding_inputs e on e.key = d.key
            where (d.entity = 'node' or d.kind <> 'goods') and d.key > '{last}' and {where} {pending}
            order by d.key
            limit 500""")
        rows.extend(chunk)
        if len(chunk) < 500 or (limit and len(rows) >= limit):
            return rows[:limit] if limit else rows
        last = chunk[-1]["key"]


def load_menu(api: ManagementApi) -> list[list[dict]]:
    """Every catering entry (class 10202), grouped by position so siblings are judged together."""
    rows = api.query("""
        select d.key, d.level, d.kind, e.embed_text as path
        from tasnif.search_documents d
        join tasnif.embedding_inputs e on e.key = d.key
        where d.key like '10202%'
        order by d.key""")
    sections: dict[str, list[dict]] = {}
    for row in rows:
        sections.setdefault(row["key"][:8], []).append(row)
    return list(sections.values())


def ask(entries: list[dict], key: str, context: ssl.SSLContext, attempts: int = 5, *,
        model: str = MODEL, instructions: str = INSTRUCTIONS, effort: str = "low") -> tuple[dict[str, dict], dict]:
    payload = [{"key": e["key"], "level": e["level"], "kind": e["kind"],
                "path": (e["path"] or "").split("\n")[0], "examples_filed_here": e.get("examples") or ""}
               for e in entries]
    body = json.dumps({
        "model": model,
        "reasoning_effort": effort,
        "messages": [{"role": "system", "content": instructions},
                     {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "everyday_terms", "strict": True, "schema": SCHEMA}},
    }).encode()
    for attempt in range(1, attempts + 1):
        request = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body, method="POST",
                                         headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=300, context=context) as response:
                data = json.loads(response.read())
            items = json.loads(data["choices"][0]["message"]["content"])["items"]
            wanted = {e["key"] for e in entries}
            return {i["key"]: i for i in items if i["key"] in wanted}, data.get("usage", {})
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            if error.code != 429 and error.code < 500 or attempt == attempts:
                raise RuntimeError(f"OpenAI HTTP {error.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException,
                json.JSONDecodeError, KeyError) as error:
            if attempt == attempts:
                raise RuntimeError(f"OpenAI: {error}") from None
        time.sleep(min(60, 2 ** attempt))
    raise AssertionError("unreachable")


def as_text(item: dict) -> str | None:
    seen, terms = set(), []
    for language in ("ru", "uz", "en"):
        for term in item.get(language) or []:
            term = " ".join(str(term).split())
            if term and term.lower() not in seen:
                seen.add(term.lower())
                terms.append(term)
    return ", ".join(terms) if terms else ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--keys", help="comma-separated document keys to try (printed, not written)")
    parser.add_argument("--apply", action="store_true", help="write terms to the database")
    parser.add_argument("--redo", action="store_true", help="include entries that already have terms")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--batch", type=int, default=25)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--menu", action="store_true", help="redo the cafe menu entries (class 10202) with the menu pass")
    args = parser.parse_args()

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY is not set.")
    try:
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()

    api = ManagementApi(args.project_ref)
    keys = [k.strip() for k in args.keys.split(",")] if args.keys else None
    if args.menu:
        batches = load_menu(api)
        entries = [e for section in batches for e in section]
        run = functools.partial(ask, key=key, context=context, model=MENU_MODEL, instructions=MENU_INSTRUCTIONS,
                                effort="medium")
    else:
        entries = load_entries(api, keys, args.redo, args.limit)
        batches = [entries[i:i + args.batch] for i in range(0, len(entries), args.batch)]
        run = functools.partial(ask, key=key, context=context)
    print(f"{len(entries)} entries", flush=True)
    write = args.apply and not keys

    started, done, usage = time.time(), 0, {"prompt_tokens": 0, "completion_tokens": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for answers, used in pool.map(run, batches):
            usage["prompt_tokens"] += used.get("prompt_tokens", 0)
            usage["completion_tokens"] += used.get("completion_tokens", 0)
            rows = [{"key": k, "terms": as_text(v)} for k, v in answers.items()]
            if not write:
                for k, v in answers.items():
                    print(f"{k}: ru={v['ru']} uz={v['uz']} en={v['en']}")
            else:
                for chunk in batched(rows, 1000, max_bytes=600_000):
                    api.query(f"""update tasnif.search_documents d set everyday_terms = v.terms, updated_at = now()
                                  from jsonb_to_recordset({sql_json(chunk)}) as v(key text, terms text)
                                  where d.key = v.key""")
            done += len(rows)
            if write and done % 500 < args.batch:
                print(f"  {done}/{len(entries)} written, tokens {usage}, {time.time() - started:.0f}s", flush=True)
    print(f"done: {done} entries with answers, tokens {usage}, {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
