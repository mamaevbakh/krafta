"""Embed the documents that meaning search runs on (tree nodes and service/cafe codes).

    OPENAI_API_KEY=... pnpm --filter tasnif search:embed            # embed what's missing or stale
    OPENAI_API_KEY=... pnpm --filter tasnif search:embed --dry-run  # count and price, send nothing

What gets embedded is `tasnif.embedding_inputs.embed_text`: the category path in
Russian and Uzbek plus the everyday words. A document is re-embedded only when
that text differs from what was embedded last time (`embed_text`), so reruns
after an unchanged import cost nothing.

Why it works the way it does:

* Model: OpenAI text-embedding-3-large shortened to 1536 dimensions, the same
  space Krafta's storefront search uses, and the column type in
  tasnif.search_documents. Queries must be embedded with the same model and size
  (see eval/score_tasnif.py), or distances mean nothing.
* ~15k short texts is roughly a million tokens: about $0.13 at list price.
* Vectors are written back through the Management API in requests kept under
  ~600 KB (the API rejects ~1 MB), rounded to 5 decimals; halfvec stores 16-bit
  floats, so more digits would be thrown away anyway.
"""

from __future__ import annotations

import argparse
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
from import_catalog import batched, database, sql_json  # noqa: E402

MODEL = "text-embedding-3-large"
DIMENSIONS = 1536
PRICE_PER_MILLION_TOKENS = 0.13


def openai_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def embed(texts: list[str], key: str, context: ssl.SSLContext, attempts: int = 6) -> tuple[list[list[float]], int]:
    body = json.dumps({"model": MODEL, "input": texts, "dimensions": DIMENSIONS}).encode()
    for attempt in range(1, attempts + 1):
        request = urllib.request.Request("https://api.openai.com/v1/embeddings", data=body, method="POST", headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=120, context=context) as response:
                data = json.loads(response.read())
            vectors = [item["embedding"] for item in sorted(data["data"], key=lambda item: item["index"])]
            return vectors, data.get("usage", {}).get("total_tokens", 0)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            if error.code != 429 and error.code < 500 or attempt == attempts:
                raise RuntimeError(f"OpenAI HTTP {error.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
            if attempt == attempts:
                raise RuntimeError(f"OpenAI network: {error}") from None
        time.sleep(min(60, 2 ** attempt))
    raise AssertionError("unreachable")


def pending(api, page: int) -> list[dict]:
    """Every embeddable document whose text changed, read in key order a page at a time."""
    rows, last = [], ""
    while True:
        chunk = api.query(f"""
            select key, embed_text from tasnif.embedding_inputs
            where key > '{last}' and embed_text is distinct from embedded_text
            order by key limit {page}""")
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        last = chunk[-1]["key"]


def embed_pending(api, key: str, batch: int = 256, pause: float = 0.3) -> dict:
    """Embed every document whose text changed since it was last embedded."""
    rows = pending(api, 2000)
    print(f"{len(rows)} documents to embed", flush=True)
    context = openai_context()
    started, tokens, written = time.time(), 0, 0
    for texts_batch in batched(rows, batch, max_bytes=10_000_000):
        vectors, used = embed([r["embed_text"] for r in texts_batch], key, context)
        tokens += used
        payload = [{"key": r["key"], "t": r["embed_text"], "e": "[" + ",".join(f"{x:.5f}" for x in v) + "]"}
                   for r, v in zip(texts_batch, vectors)]
        for chunk in batched(payload, 200, max_bytes=600_000):
            api.query(f"""
                update tasnif.search_documents d
                set embedding = v.e::extensions.halfvec({DIMENSIONS}), embed_text = v.t, embedded_at = now()
                from jsonb_to_recordset({sql_json(chunk)}) as v(key text, t text, e text)
                where d.key = v.key""")
            written += len(chunk)
            time.sleep(pause)
        print(f"  {written}/{len(rows)} embedded, {tokens:,} tokens, {time.time() - started:.0f}s", flush=True)
    cost = tokens / 1_000_000 * PRICE_PER_MILLION_TOKENS
    print(f"done: {written} documents, {tokens:,} tokens (${cost:.3f})")
    return {"embedded": written, "tokens": tokens, "usd": round(cost, 4)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    parser.add_argument("--dry-run", action="store_true", help="count and estimate cost; call nothing")
    parser.add_argument("--batch", type=int, default=256, help="texts per OpenAI request")
    parser.add_argument("--pause", type=float, default=0.3, help="seconds between database writes")
    args = parser.parse_args()

    api = database(args.project_ref)
    if args.dry_run:
        rows = pending(api, 2000)
        characters = sum(len(r["embed_text"]) for r in rows)
        # Cyrillic runs about one token per 2-3 characters; err high.
        estimate = characters / 2.5 / 1_000_000 * PRICE_PER_MILLION_TOKENS
        print(f"{len(rows)} documents to embed, {characters:,} characters, roughly ${estimate:.2f}")
        return
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY is not set.")
    embed_pending(api, key, args.batch, args.pause)


if __name__ == "__main__":
    main()
