"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RegistryEntry = {
  id: string;
  tax_code: string;
  package_code: string;
  title: string | null;
};

type TaxRegistry = {
  id: string;
  name: string;
  source: string | null;
  is_active: boolean;
  schema_id: string;
  entries: RegistryEntry[];
};

function parseLines(input: string) {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [taxCode, packageCode, ...titleParts] = line.split(",").map((part) => part.trim());
    return {
      taxCode,
      packageCode,
      title: titleParts.join(",").trim() || null,
    };
  });
}

export function TaxCodesManagerClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const [orgId, setOrgId] = useState(initialOrgId || memberships[0]?.orgId || "");
  const [registryName, setRegistryName] = useState("Default UZ Registry");
  const [source, setSource] = useState("tasnif_manual_upload");
  const [replace, setReplace] = useState(false);
  const [lines, setLines] = useState("");
  const [registries, setRegistries] = useState<TaxRegistry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.orgId === orgId) ?? null,
    [memberships, orgId],
  );

  async function loadRegistries(targetOrgId: string) {
    if (!targetOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/tax-codes?orgId=${encodeURIComponent(targetOrgId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { registries?: TaxRegistry[]; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setRegistries(json?.registries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRegistries(orgId);
  }, [orgId]);

  async function uploadRegistry(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const entries = parseLines(lines);
      if (entries.length === 0) {
        throw new Error("Please provide at least one line: taxCode,packageCode[,title]");
      }

      const res = await fetch("/api/dashboard/tax-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          schemaCode: "UZ_AUTOFISCAL_V1",
          registryName,
          source,
          replace,
          entries,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; imported?: number; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);

      setStatus(`Imported ${json?.imported ?? entries.length} tax code entries.`);
      setLines("");
      await loadRegistries(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <label className="text-sm font-medium" htmlFor="tax-registry-org">
          Organization
        </label>
        <select
          id="tax-registry-org"
          className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          {memberships.map((membership) => (
            <option key={membership.orgId} value={membership.orgId}>
              {membership.orgName} ({membership.role})
            </option>
          ))}
        </select>
        {selectedMembership ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Org slug: {selectedMembership.orgSlug}
          </p>
        ) : null}
      </div>

      <form onSubmit={uploadRegistry} className="space-y-4 rounded-md border bg-background p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="tax-registry-name">
              Registry name
            </label>
            <Input
              id="tax-registry-name"
              value={registryName}
              onChange={(e) => setRegistryName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="tax-registry-source">
              Source
            </label>
            <Input
              id="tax-registry-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="tasnif_manual_upload"
            />
          </div>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="tax-registry-lines">
            Entries (one per line)
          </label>
          <textarea
            id="tax-registry-lines"
            className="min-h-44 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={"06209001001000000,1546532,SaaS subscription"}
            required
          />
          <p className="text-xs text-muted-foreground">
            Format: <code>taxCode,packageCode[,title]</code>
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          Replace existing entries in this registry
        </label>

        <Button type="submit" disabled={saving || !orgId}>
          {saving ? "Uploading..." : "Upload Tax Code Registry"}
        </Button>
      </form>

      <div className="rounded-md border bg-background p-4">
        <h2 className="text-sm font-medium">Current registries</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading registries...</p>
        ) : registries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No registries uploaded yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {registries.map((registry) => (
              <div key={registry.id} className="rounded-md border p-3">
                <p className="font-medium">{registry.name}</p>
                <p className="text-xs text-muted-foreground">
                  Source: {registry.source || "n/a"} · Entries: {registry.entries.length}
                </p>
                <div className="mt-2 max-h-56 overflow-auto rounded border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-1">Tax code</th>
                        <th className="px-2 py-1">Package code</th>
                        <th className="px-2 py-1">Title</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registry.entries.slice(0, 200).map((entry) => (
                        <tr key={entry.id} className="border-t">
                          <td className="px-2 py-1">{entry.tax_code}</td>
                          <td className="px-2 py-1">{entry.package_code}</td>
                          <td className="px-2 py-1">{entry.title || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {status ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
