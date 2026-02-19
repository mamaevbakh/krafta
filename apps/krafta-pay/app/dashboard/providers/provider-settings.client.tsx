"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProviderState = {
  configured: boolean;
  account?: {
    id: string;
    status: string;
    environment: "test" | "live";
    displayLabel: string | null;
  };
  credentials?: {
    apiBaseUrl: string | null;
    terminalId: string | null;
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
  };
  fiscalization?: {
    country: string | null;
    taxIdentityType: "TIN" | "PINFL" | null;
    taxIdentityValue: string | null;
  };
};

export function ProviderSettingsClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const defaultOrgId = initialOrgId || memberships[0]?.orgId || "";
  const [orgId, setOrgId] = useState(defaultOrgId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<ProviderState | null>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [displayLabel, setDisplayLabel] = useState("Uzum");
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const [fiscalCountry, setFiscalCountry] = useState("UZ");
  const [taxIdentityType, setTaxIdentityType] = useState<"TIN" | "PINFL">("TIN");
  const [taxIdentityValue, setTaxIdentityValue] = useState("");

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.orgId === orgId) ?? null,
    [memberships, orgId],
  );

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    fetch(
      `/api/dashboard/providers/uzum?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as ProviderState & { error?: string } | null;
        if (!res.ok) {
          throw new Error(json?.error ?? `http_${res.status}`);
        }
        return json;
      })
      .then((json) => {
        if (ignore) return;
        setProviderState(json ?? null);
        setApiBaseUrl("");
        setTerminalId("");
        setDisplayLabel("Uzum");
        setFiscalCountry("UZ");
        setTaxIdentityType("TIN");
        setTaxIdentityValue("");
        if (json?.credentials?.apiBaseUrl) setApiBaseUrl(json.credentials.apiBaseUrl);
        if (json?.credentials?.terminalId) setTerminalId(json.credentials.terminalId);
        if (json?.account?.displayLabel) setDisplayLabel(json.account.displayLabel);
        if (json?.fiscalization?.country) setFiscalCountry(json.fiscalization.country);
        if (json?.fiscalization?.taxIdentityType) {
          setTaxIdentityType(json.fiscalization.taxIdentityType);
        }
        if (json?.fiscalization?.taxIdentityValue) {
          setTaxIdentityValue(json.fiscalization.taxIdentityValue);
        }
      })
      .catch((e) => {
        if (ignore) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [orgId, environment]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;

    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dashboard/providers/uzum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          environment,
          displayLabel,
          apiBaseUrl,
          terminalId,
          apiKey,
          webhookSecret,
          fiscalCountry,
          taxIdentityType,
          taxIdentityValue,
          status: "active",
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `http_${res.status}`);
      }
      setStatusMessage("Uzum provider configuration saved.");
      setApiKey("");
      setWebhookSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <label className="text-sm font-medium" htmlFor="provider-org">
          Organization
        </label>
        <select
          id="provider-org"
          className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
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

      <form onSubmit={onSave} className="space-y-4 rounded-md border bg-background p-4">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-display-label">
            Display label
          </label>
          <Input
            id="provider-display-label"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-env">
            Environment
          </label>
          <select
            id="provider-env"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "test" | "live")}
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-fiscal-country">
            Fiscal country
          </label>
          <Input
            id="provider-fiscal-country"
            value={fiscalCountry}
            onChange={(e) => setFiscalCountry(e.target.value.toUpperCase())}
            placeholder="UZ"
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-tax-type">
            Tax identity type
          </label>
          <select
            id="provider-tax-type"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={taxIdentityType}
            onChange={(e) => setTaxIdentityType(e.target.value as "TIN" | "PINFL")}
          >
            <option value="TIN">TIN</option>
            <option value="PINFL">PINFL</option>
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-tax-value">
            Tax identity value
          </label>
          <Input
            id="provider-tax-value"
            value={taxIdentityValue}
            onChange={(e) => setTaxIdentityValue(e.target.value)}
            placeholder="123456789"
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-api-base">
            API base URL
          </label>
          <Input
            id="provider-api-base"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://api.example.uzum.com"
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-terminal">
            Terminal ID
          </label>
          <Input
            id="provider-terminal"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-api-key">
            API Key (write only)
          </label>
          <Input
            id="provider-api-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste Uzum API key"
            required={!providerState?.credentials?.hasApiKey}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="provider-webhook-secret">
            Webhook secret (write only)
          </label>
          <Input
            id="provider-webhook-secret"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Paste webhook signature secret"
            required={!providerState?.credentials?.hasWebhookSecret}
          />
        </div>

        <Button type="submit" disabled={saving || loading || !orgId}>
          {saving ? "Saving..." : "Save Uzum provider"}
        </Button>
      </form>

      {providerState?.configured ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <p className="font-medium">Current configuration</p>
          <p className="mt-2 text-muted-foreground">
            Status: {providerState.account?.status ?? "unknown"}
          </p>
          <p className="text-muted-foreground">
            API key configured: {providerState.credentials?.hasApiKey ? "yes" : "no"}
          </p>
          <p className="text-muted-foreground">
            Webhook secret configured: {providerState.credentials?.hasWebhookSecret ? "yes" : "no"}
          </p>
          <p className="text-muted-foreground">
            Fiscal country: {providerState.fiscalization?.country ?? "not set"}
          </p>
          <p className="text-muted-foreground">
            Tax identity:{" "}
            {providerState.fiscalization?.taxIdentityType &&
            providerState.fiscalization?.taxIdentityValue
              ? `${providerState.fiscalization.taxIdentityType} ${providerState.fiscalization.taxIdentityValue}`
              : "not set"}
          </p>
        </div>
      ) : null}

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
