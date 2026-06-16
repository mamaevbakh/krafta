"use client";

import { useEffect, useMemo, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProviderId = "atmos" | "uzum";

export function ProviderSettingsClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const defaultOrgId = initialOrgId || memberships[0]?.orgId || "";
  const [orgId, setOrgId] = useState(defaultOrgId);
  // Atmos first — it's the flagship inline provider.
  const [provider, setProvider] = useState<ProviderId>("atmos");

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.orgId === orgId) ?? null,
    [memberships, orgId],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-background p-4">
        <label className="text-sm font-medium" htmlFor="provider-org">
          Organization
        </label>
        <select
          id="provider-org"
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

      <div className="flex gap-2">
        {(["atmos", "uzum"] as const).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={provider === p ? "default" : "outline"}
            onClick={() => setProvider(p)}
          >
            {p === "atmos" ? "Atmos" : "Uzum"}
          </Button>
        ))}
      </div>

      {orgId ? (
        provider === "atmos" ? (
          <AtmosProviderForm orgId={orgId} />
        ) : (
          <UzumProviderForm orgId={orgId} />
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Select an organization to configure a provider.
        </p>
      )}
    </div>
  );
}

function StatusBanner({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  return (
    <>
      {message ? (
        <div className="rounded-md border bg-muted p-3 text-sm">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Atmos — inline card provider. Just OAuth credentials + store id.
// ---------------------------------------------------------------------------

type AtmosState = {
  configured: boolean;
  account?: { id: string; status: string; environment: "test" | "live"; displayLabel: string | null };
  credentials?: {
    apiBaseUrl: string | null;
    storeId: string | null;
    hasConsumerKey: boolean;
    hasConsumerSecret: boolean;
  };
};

const ATMOS_DEFAULT_API_BASE = "https://apigw.atmos.uz";

function AtmosProviderForm({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [state, setState] = useState<AtmosState | null>(null);

  const [displayLabel, setDisplayLabel] = useState("Atmos");
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [storeId, setStoreId] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    fetch(
      `/api/dashboard/providers/atmos?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as (AtmosState & { error?: string }) | null;
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
        return json;
      })
      .then((json) => {
        if (ignore) return;
        setState(json ?? null);
        setDisplayLabel(json?.account?.displayLabel ?? "Atmos");
        setApiBaseUrl(json?.credentials?.apiBaseUrl ?? "");
        setStoreId(json?.credentials?.storeId ?? "");
        // Secrets are write-only; never prefilled.
        setConsumerKey("");
        setConsumerSecret("");
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
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
      const res = await fetch("/api/dashboard/providers/atmos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          environment,
          displayLabel,
          apiBaseUrl: apiBaseUrl || undefined,
          storeId,
          consumerKey: consumerKey || undefined,
          consumerSecret: consumerSecret || undefined,
          status: "active",
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage("Atmos provider configuration saved.");
      setConsumerKey("");
      setConsumerSecret("");
      // Reflect the now-configured state without a refetch round-trip.
      setState((prev) => ({
        configured: true,
        account: { id: prev?.account?.id ?? "", status: "active", environment, displayLabel },
        credentials: {
          apiBaseUrl: apiBaseUrl || ATMOS_DEFAULT_API_BASE,
          storeId,
          hasConsumerKey: true,
          hasConsumerSecret: true,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSave} className="space-y-4 rounded-md border bg-background p-4">
        <p className="text-xs text-muted-foreground">
          Atmos collects the card on Krafta Pay&apos;s page (no redirect). Paste the
          OAuth credentials and store id from your Atmos cabinet.
        </p>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-display-label">Display label</FieldLabel>
          <Input
            id="atmos-display-label"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-env">Environment</FieldLabel>
          <select
            id="atmos-env"
            className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "test" | "live")}
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-store-id">Store ID</FieldLabel>
          <Input
            id="atmos-store-id"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="e.g. 10934"
            inputMode="numeric"
            required
          />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-consumer-key">Consumer key (write only)</FieldLabel>
          <Input
            id="atmos-consumer-key"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="Paste Atmos consumer key"
            required={!state?.credentials?.hasConsumerKey}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-consumer-secret">Consumer secret (write only)</FieldLabel>
          <Input
            id="atmos-consumer-secret"
            value={consumerSecret}
            onChange={(e) => setConsumerSecret(e.target.value)}
            placeholder="Paste Atmos consumer secret"
            required={!state?.credentials?.hasConsumerSecret}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="atmos-api-base">API base URL</FieldLabel>
          <Input
            id="atmos-api-base"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder={ATMOS_DEFAULT_API_BASE}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use {ATMOS_DEFAULT_API_BASE}.
          </p>
        </div>

        <Button type="submit" disabled={saving || loading || !orgId}>
          {saving ? "Saving…" : "Save Atmos provider"}
        </Button>
      </form>

      {state?.configured ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <p className="font-medium">Current configuration</p>
          <p className="mt-2 text-muted-foreground">Status: {state.account?.status ?? "unknown"}</p>
          <p className="text-muted-foreground">
            Consumer key configured: {state.credentials?.hasConsumerKey ? "yes" : "no"}
          </p>
          <p className="text-muted-foreground">
            Consumer secret configured: {state.credentials?.hasConsumerSecret ? "yes" : "no"}
          </p>
          <p className="text-muted-foreground">Store ID: {state.credentials?.storeId ?? "not set"}</p>
          <p className="text-muted-foreground">
            API base URL: {state.credentials?.apiBaseUrl ?? ATMOS_DEFAULT_API_BASE}
          </p>
        </div>
      ) : null}

      <StatusBanner error={error} message={statusMessage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uzum — redirect/binding provider (unchanged behaviour, scoped to a component).
// ---------------------------------------------------------------------------

type UzumState = {
  configured: boolean;
  account?: { id: string; status: string; environment: "test" | "live"; displayLabel: string | null };
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

function UzumProviderForm({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<UzumState | null>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [displayLabel, setDisplayLabel] = useState("Uzum");
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const [fiscalCountry, setFiscalCountry] = useState("UZ");
  const [taxIdentityType, setTaxIdentityType] = useState<"TIN" | "PINFL">("TIN");
  const [taxIdentityValue, setTaxIdentityValue] = useState("");

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
        const json = (await res.json().catch(() => null)) as (UzumState & { error?: string }) | null;
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
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
        if (json?.fiscalization?.taxIdentityType) setTaxIdentityType(json.fiscalization.taxIdentityType);
        if (json?.fiscalization?.taxIdentityValue) setTaxIdentityValue(json.fiscalization.taxIdentityValue);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
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
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
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
      <form onSubmit={onSave} className="space-y-4 rounded-md border bg-background p-4">
        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-display-label">Display label</FieldLabel>
          <Input id="uzum-display-label" value={displayLabel} onChange={(e) => setDisplayLabel(e.target.value)} required />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-env">Environment</FieldLabel>
          <select
            id="uzum-env"
            className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "test" | "live")}
          >
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-fiscal-country">Fiscal country</FieldLabel>
          <Input id="uzum-fiscal-country" value={fiscalCountry} onChange={(e) => setFiscalCountry(e.target.value.toUpperCase())} placeholder="UZ" required />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-tax-type">Tax identity type</FieldLabel>
          <select
            id="uzum-tax-type"
            className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
            value={taxIdentityType}
            onChange={(e) => setTaxIdentityType(e.target.value as "TIN" | "PINFL")}
          >
            <option value="TIN">TIN</option>
            <option value="PINFL">PINFL</option>
          </select>
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-tax-value">Tax identity value</FieldLabel>
          <Input id="uzum-tax-value" value={taxIdentityValue} onChange={(e) => setTaxIdentityValue(e.target.value)} placeholder="123456789" required />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-api-base">API base URL</FieldLabel>
          <Input id="uzum-api-base" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.example.uzum.com" required />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-terminal">Terminal ID</FieldLabel>
          <Input id="uzum-terminal" value={terminalId} onChange={(e) => setTerminalId(e.target.value)} required />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-api-key">API Key (write only)</FieldLabel>
          <Input id="uzum-api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste Uzum API key" required={!providerState?.credentials?.hasApiKey} autoComplete="off" />
        </div>

        <div className="grid gap-1">
          <FieldLabel htmlFor="uzum-webhook-secret">Webhook secret (write only)</FieldLabel>
          <Input id="uzum-webhook-secret" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Paste webhook signature secret" required={!providerState?.credentials?.hasWebhookSecret} autoComplete="off" />
        </div>

        <Button type="submit" disabled={saving || loading || !orgId}>
          {saving ? "Saving…" : "Save Uzum provider"}
        </Button>
      </form>

      {providerState?.configured ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <p className="font-medium">Current configuration</p>
          <p className="mt-2 text-muted-foreground">Status: {providerState.account?.status ?? "unknown"}</p>
          <p className="text-muted-foreground">API key configured: {providerState.credentials?.hasApiKey ? "yes" : "no"}</p>
          <p className="text-muted-foreground">Webhook secret configured: {providerState.credentials?.hasWebhookSecret ? "yes" : "no"}</p>
          <p className="text-muted-foreground">Fiscal country: {providerState.fiscalization?.country ?? "not set"}</p>
          <p className="text-muted-foreground">
            Tax identity:{" "}
            {providerState.fiscalization?.taxIdentityType && providerState.fiscalization?.taxIdentityValue
              ? `${providerState.fiscalization.taxIdentityType} ${providerState.fiscalization.taxIdentityValue}`
              : "not set"}
          </p>
        </div>
      ) : null}

      <StatusBanner error={error} message={statusMessage} />
    </div>
  );
}
