"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  environment: string;
  created_at: string;
  revoked_at: string | null;
};

export function ApiKeysManagerClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const [orgId, setOrgId] = useState(initialOrgId || memberships[0]?.orgId || "");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"test" | "live">("test");

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.orgId === orgId) ?? null,
    [memberships, orgId],
  );

  async function loadKeys(targetOrgId: string) {
    if (!targetOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/api-keys?orgId=${encodeURIComponent(targetOrgId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { apiKeys?: ApiKeyRow[]; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setKeys(json?.apiKeys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys(orgId);
  }, [orgId]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    setStatusMessage(null);
    setCreatedToken(null);
    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          name: name.trim() || undefined,
          environment,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; token?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);

      setCreatedToken(json?.token ?? null);
      setStatusMessage("API key created. Copy it now, it won't be shown again.");
      setName("");
      await loadKeys(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function revokeKey(keyId: string) {
    if (!orgId) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, keyId }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage("API key revoked.");
      await loadKeys(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <label className="text-sm font-medium" htmlFor="keys-org">
          Organization
        </label>
        <select
          id="keys-org"
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

      <form onSubmit={createKey} className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-3">
        <div className="grid gap-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="key-name">
            Key name
          </label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Krafta Catalogs dev"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="key-env">
            Environment
          </label>
          <select
            id="key-env"
            className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value === "live" ? "live" : "test")}
          >
            <option value="test">test</option>
            <option value="live">live</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <Button type="submit">Create API key</Button>
        </div>
      </form>

      {createdToken ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Copy this token now</p>
          <code className="mt-1 block overflow-x-auto rounded bg-amber-100 px-2 py-1 text-xs">
            {createdToken}
          </code>
        </div>
      ) : null}

      <div className="rounded-md border bg-background p-4">
        <h2 className="text-sm font-medium">Existing keys</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {key.environment} · {key.prefix}••••{key.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {key.revoked_at ? `Revoked: ${key.revoked_at}` : `Created: ${key.created_at}`}
                    </p>
                  </div>
                  {!key.revoked_at ? (
                    <Button type="button" variant="destructive" size="sm" onClick={() => revokeKey(key.id)}>
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {statusMessage ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          {statusMessage}
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
