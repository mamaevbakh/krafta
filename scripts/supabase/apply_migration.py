"""Apply one committed migration file to a Supabase project, byte for byte, and record it under
the file's own version.

    uv run --with certifi scripts/supabase/apply_migration.py supabase/migrations/20260917051500_tasnif_search.sql
    uv run --with certifi scripts/supabase/apply_migration.py <file> --project-ref hlmcoirjaydrfqcmnuun

Why this exists: there is no dev database (see CLAUDE.md, Data layer), `supabase db push` refuses
while prod's history holds versions with no file in this repo, and the MCP's `apply_migration`
records its own timestamp and needs the SQL retyped into a tool call, which for a 20 KB file is
a transcription risk. This sends the file exactly as committed and inserts the history row
(`version`, `name`, `statements`) in the same request, so the DDL and its record land together
or not at all. `statements` holds the whole file as one element, the shape MCP leaves.

It refuses to run if the version or name is already recorded. Dry-run the file first (a DO block
ending in RAISE EXCEPTION); this script does not.

Auth: the Supabase CLI token (env SUPABASE_ACCESS_TOKEN, else the macOS keychain entry written by
`supabase login`).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def token() -> str:
    if os.environ.get("SUPABASE_ACCESS_TOKEN"):
        return os.environ["SUPABASE_ACCESS_TOKEN"]
    stored = subprocess.run(["security", "find-generic-password", "-s", "Supabase CLI", "-w"],
                            capture_output=True, text=True).stdout.strip()
    if not stored:
        sys.exit("No SUPABASE_ACCESS_TOKEN and no Supabase CLI token in the keychain. Run `supabase login`.")
    return base64.b64decode(stored.removeprefix("go-keyring-base64:")).decode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--project-ref", default="hlmcoirjaydrfqcmnuun")
    args = parser.parse_args()

    match = re.fullmatch(r"(\d{14})_(.+)\.sql", args.file.name)
    if not match:
        sys.exit(f"{args.file.name}: expected <14-digit version>_<name>.sql")
    version, name = match.groups()
    sql = args.file.read_text(encoding="utf-8")
    if "$migration_file$" in sql:
        sys.exit("the file contains the dollar-quote tag used to record it")

    try:
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()
    bearer = token()

    def query(text: str) -> list:
        request = urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{args.project_ref}/database/query",
            data=json.dumps({"query": text}).encode(), method="POST",
            headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=600, context=context) as response:
                return json.loads(response.read() or b"[]")
        except urllib.error.HTTPError as error:
            sys.exit(f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:3000]}")

    recorded = query("select version, name from supabase_migrations.schema_migrations "
                     f"where version = '{version}' or name = '{name}'")
    if recorded:
        sys.exit(f"already recorded: {recorded}")
    query(sql + "\ninsert into supabase_migrations.schema_migrations (version, name, statements) "
          f"values ('{version}', '{name}', array[$migration_file${sql}$migration_file$]);")
    print(query(f"select version, name from supabase_migrations.schema_migrations where version = '{version}'"))


if __name__ == "__main__":
    main()
