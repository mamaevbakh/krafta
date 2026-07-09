"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MembershipOption } from "@/lib/org-memberships";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PenLine, Trash2 } from "lucide-react";

type ProviderId = "atmos" | "uzum";
type Environment = "test" | "live";

const PROVIDER_LABEL: Record<ProviderId, string> = { atmos: "Atmos", uzum: "Uzum" };
const ATMOS_DEFAULT_API_BASE = "https://apigw.atmos.uz";

const PROVIDER_ENV_COMBOS: Array<{ provider: ProviderId; environment: Environment }> = [
  { provider: "atmos", environment: "live" },
  { provider: "atmos", environment: "test" },
  { provider: "uzum", environment: "live" },
  { provider: "uzum", environment: "test" },
];

type AccountView = {
  provider: ProviderId;
  environment: Environment;
  status: string;
  displayLabel: string | null;
  storeOrTerminal: string | null;
  apiBaseUrl: string | null;
};

async function fetchAccount(
  provider: ProviderId,
  orgId: string,
  environment: Environment,
): Promise<AccountView | null> {
  try {
    const res = await fetch(
      `/api/dashboard/providers/${provider}?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
      { cache: "no-store" },
    );
    const json = (await res.json().catch(() => null)) as {
      configured?: boolean;
      account?: { status?: string; displayLabel?: string | null };
      credentials?: { apiBaseUrl?: string | null; storeId?: string | null; terminalId?: string | null };
    } | null;
    if (!res.ok || !json?.configured) return null;
    return {
      provider,
      environment,
      status: json.account?.status ?? "unknown",
      displayLabel: json.account?.displayLabel ?? null,
      storeOrTerminal:
        provider === "atmos"
          ? json.credentials?.storeId ?? null
          : json.credentials?.terminalId ?? null,
      apiBaseUrl: json.credentials?.apiBaseUrl ?? null,
    };
  } catch {
    return null;
  }
}

export function ProviderSettingsClient({
  memberships,
  initialOrgId,
}: {
  memberships: MembershipOption[];
  initialOrgId?: string;
}) {
  const [orgId, setOrgId] = useState(initialOrgId || memberships[0]?.orgId || "");
  const [provider, setProvider] = useState<ProviderId>("atmos");
  const [environment, setEnvironment] = useState<Environment>("live");
  const [refreshKey, setRefreshKey] = useState(0);
  const formRef = useRef<HTMLDivElement | null>(null);

  const selectedMembership = memberships.find((m) => m.orgId === orgId) ?? null;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const startEdit = useCallback((p: ProviderId, env: Environment) => {
    setProvider(p);
    setEnvironment(env);
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="provider-org">Organization</Label>
        <Select value={orgId} onValueChange={(v) => setOrgId(v ?? "")}>
          <SelectTrigger id="provider-org" className="w-full sm:max-w-md">
            <SelectValue placeholder="Select an organization">
              {(value) => {
                const m = memberships.find((x) => x.orgId === value);
                return m ? `${m.orgName} (${m.role})` : "Select an organization";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {memberships.map((m) => (
              <SelectItem key={m.orgId} value={m.orgId}>
                {m.orgName} ({m.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMembership ? (
          <p className="font-mono text-xs text-muted-foreground">{selectedMembership.orgSlug}</p>
        ) : null}
      </div>

      {orgId ? (
        <>
          <ConnectedAccounts
            orgId={orgId}
            refreshKey={refreshKey}
            onEdit={startEdit}
            onChanged={refresh}
          />

          <div ref={formRef} className="scroll-mt-6">
            <ProviderForm
              orgId={orgId}
              provider={provider}
              environment={environment}
              onProviderChange={setProvider}
              onEnvironmentChange={setEnvironment}
              onSaved={refresh}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select an organization to manage providers.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connected accounts — one row per (provider, environment), with actions.
// ---------------------------------------------------------------------------

function ConnectedAccounts({
  orgId,
  refreshKey,
  onEdit,
  onChanged,
}: {
  orgId: string;
  refreshKey: number;
  onEdit: (p: ProviderId, env: Environment) => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    Promise.all(
      PROVIDER_ENV_COMBOS.map((c) => fetchAccount(c.provider, orgId, c.environment)),
    ).then((results) => {
      if (ignore) return;
      setRows(results.filter((r): r is AccountView => r !== null));
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [orgId, refreshKey]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Connected accounts</h2>
        <p className="text-sm text-muted-foreground">
          Credentials per provider and environment. Live and test are separate accounts —{" "}
          <span className="font-mono">PAY_ENV</span> decides which one charges.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Checking connections…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Nothing connected yet for this organization. Use the form below to connect a provider.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((account) => (
            <AccountRow
              key={`${account.provider}-${account.environment}`}
              account={account}
              orgId={orgId}
              onEdit={onEdit}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountRow({
  account,
  orgId,
  onEdit,
  onChanged,
}: {
  account: AccountView;
  orgId: string;
  onEdit: (p: ProviderId, env: Environment) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = [
    account.displayLabel && account.displayLabel !== PROVIDER_LABEL[account.provider]
      ? account.displayLabel
      : null,
    account.storeOrTerminal
      ? `${account.provider === "atmos" ? "store" : "terminal"} ${account.storeOrTerminal}`
      : null,
    account.apiBaseUrl,
  ]
    .filter(Boolean)
    .join("  ·  ");

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/providers/${account.provider}?orgId=${encodeURIComponent(orgId)}&environment=${account.environment}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409 || json?.error === "provider_in_use") {
        setError(
          "This account has payment history, so it can't be deleted. Use “Replace credentials” to swap the keys instead.",
        );
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isActive = account.status === "active";

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{PROVIDER_LABEL[account.provider]}</span>
          <Badge
            variant={account.environment === "live" ? "default" : "outline"}
            className={cn("rounded-full", account.environment === "test" && "border-dashed")}
          >
            {account.environment}
          </Badge>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs",
              isActive ? "text-muted-foreground" : "text-destructive",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isActive ? "bg-foreground" : "bg-destructive",
              )}
            />
            {account.status}
          </span>
        </div>
        {subtitle ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(account.provider, account.environment)}
        >
          <PenLine className="size-4" />
          Replace credentials
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Disconnect ${PROVIDER_LABEL[account.provider]} ${account.environment}`}
                disabled={busy}
              />
            }
          >
            <Trash2 className="size-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Disconnect {PROVIDER_LABEL[account.provider]} ({account.environment})?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes the stored credentials for the{" "}
                <span className="font-medium">{account.environment}</span>{" "}
                environment. An account with existing payments is kept for the audit trail — if so,
                you&apos;ll be told to replace its credentials instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDisconnect}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Connect / update form — provider + environment toggles, then fields.
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProviderForm({
  orgId,
  provider,
  environment,
  onProviderChange,
  onEnvironmentChange,
  onSaved,
}: {
  orgId: string;
  provider: ProviderId;
  environment: Environment;
  onProviderChange: (p: ProviderId) => void;
  onEnvironmentChange: (e: Environment) => void;
  onSaved: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect or update a provider</CardTitle>
        <CardDescription>
          Pick the provider and environment, then paste the credentials from your provider cabinet.
          Saving an already-connected environment replaces its credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Segmented
              options={[
                { value: "atmos", label: "Atmos" },
                { value: "uzum", label: "Uzum" },
              ]}
              value={provider}
              onChange={onProviderChange}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Environment</Label>
            <Segmented
              options={[
                { value: "live", label: "Live" },
                { value: "test", label: "Test" },
              ]}
              value={environment}
              onChange={onEnvironmentChange}
            />
          </div>
        </div>

        <Separator />

        {provider === "atmos" ? (
          <AtmosFields orgId={orgId} environment={environment} onSaved={onSaved} />
        ) : (
          <UzumFields orgId={orgId} environment={environment} onSaved={onSaved} />
        )}
      </CardContent>
    </Card>
  );
}

function useFieldError() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return { error, setError, message, setMessage };
}

function AtmosFields({
  orgId,
  environment,
  onSaved,
}: {
  orgId: string;
  environment: Environment;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error, setError, message, setMessage } = useFieldError();
  const [connected, setConnected] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);

  const [displayLabel, setDisplayLabel] = useState("Atmos");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [storeId, setStoreId] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch(
      `/api/dashboard/providers/atmos?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
        return json;
      })
      .then((json) => {
        if (ignore) return;
        setConnected(Boolean(json?.configured));
        setHasKey(Boolean(json?.credentials?.hasConsumerKey));
        setHasSecret(Boolean(json?.credentials?.hasConsumerSecret));
        setDisplayLabel(json?.account?.displayLabel ?? "Atmos");
        setApiBaseUrl(json?.credentials?.apiBaseUrl ?? "");
        setStoreId(json?.credentials?.storeId ?? "");
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
  }, [orgId, environment, setError, setMessage]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
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
      setMessage(connected ? "Atmos credentials updated." : "Atmos connected.");
      setConsumerKey("");
      setConsumerSecret("");
      setHasKey(true);
      setHasSecret(true);
      setConnected(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Atmos collects the card on Krafta Pay&apos;s page (no redirect). Paste the OAuth credentials
        and store id from your Atmos cabinet.
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor="atmos-display-label">Display label</Label>
        <Input
          id="atmos-display-label"
          value={displayLabel}
          onChange={(e) => setDisplayLabel(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="atmos-store-id">Store ID</Label>
        <Input
          id="atmos-store-id"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          placeholder="e.g. 10934"
          inputMode="numeric"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="atmos-consumer-key">
          Consumer key{" "}
          {hasKey ? (
            <span className="font-normal text-muted-foreground">— saved, leave blank to keep</span>
          ) : null}
        </Label>
        <Input
          id="atmos-consumer-key"
          value={consumerKey}
          onChange={(e) => setConsumerKey(e.target.value)}
          placeholder={hasKey ? "•••••••••• (unchanged)" : "Paste Atmos consumer key"}
          required={!hasKey}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="atmos-consumer-secret">
          Consumer secret{" "}
          {hasSecret ? (
            <span className="font-normal text-muted-foreground">— saved, leave blank to keep</span>
          ) : null}
        </Label>
        <Input
          id="atmos-consumer-secret"
          value={consumerSecret}
          onChange={(e) => setConsumerSecret(e.target.value)}
          placeholder={hasSecret ? "•••••••••• (unchanged)" : "Paste Atmos consumer secret"}
          required={!hasSecret}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="atmos-api-base">API base URL</Label>
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

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving || loading}>
          {saving ? "Saving…" : connected ? "Update Atmos credentials" : "Connect Atmos"}
        </Button>
        {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function UzumFields({
  orgId,
  environment,
  onSaved,
}: {
  orgId: string;
  environment: Environment;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error, setError, message, setMessage } = useFieldError();
  const [connected, setConnected] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);

  const [displayLabel, setDisplayLabel] = useState("Uzum");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [fiscalCountry, setFiscalCountry] = useState("UZ");
  const [taxIdentityType, setTaxIdentityType] = useState<"TIN" | "PINFL">("TIN");
  const [taxIdentityValue, setTaxIdentityValue] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch(
      `/api/dashboard/providers/uzum?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
        return json;
      })
      .then((json) => {
        if (ignore) return;
        setConnected(Boolean(json?.configured));
        setHasApiKey(Boolean(json?.credentials?.hasApiKey));
        setHasWebhookSecret(Boolean(json?.credentials?.hasWebhookSecret));
        setDisplayLabel(json?.account?.displayLabel ?? "Uzum");
        setApiBaseUrl(json?.credentials?.apiBaseUrl ?? "");
        setTerminalId(json?.credentials?.terminalId ?? "");
        setFiscalCountry(json?.fiscalization?.country ?? "UZ");
        setTaxIdentityType(json?.fiscalization?.taxIdentityType ?? "TIN");
        setTaxIdentityValue(json?.fiscalization?.taxIdentityValue ?? "");
        setApiKey("");
        setWebhookSecret("");
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
  }, [orgId, environment, setError, setMessage]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
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
      setMessage(connected ? "Uzum credentials updated." : "Uzum connected.");
      setApiKey("");
      setWebhookSecret("");
      setHasApiKey(true);
      setHasWebhookSecret(true);
      setConnected(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="uzum-display-label">Display label</Label>
        <Input
          id="uzum-display-label"
          value={displayLabel}
          onChange={(e) => setDisplayLabel(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-fiscal-country">Fiscal country</Label>
        <Input
          id="uzum-fiscal-country"
          value={fiscalCountry}
          onChange={(e) => setFiscalCountry(e.target.value.toUpperCase())}
          placeholder="UZ"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-tax-type">Tax identity type</Label>
        <Select
          value={taxIdentityType}
          onValueChange={(v) => setTaxIdentityType(v as "TIN" | "PINFL")}
        >
          <SelectTrigger id="uzum-tax-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TIN">TIN</SelectItem>
            <SelectItem value="PINFL">PINFL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-tax-value">Tax identity value</Label>
        <Input
          id="uzum-tax-value"
          value={taxIdentityValue}
          onChange={(e) => setTaxIdentityValue(e.target.value)}
          placeholder="123456789"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-api-base">API base URL</Label>
        <Input
          id="uzum-api-base"
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="https://api.example.uzum.com"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-terminal">Terminal ID</Label>
        <Input
          id="uzum-terminal"
          value={terminalId}
          onChange={(e) => setTerminalId(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-api-key">
          API key{" "}
          {hasApiKey ? (
            <span className="font-normal text-muted-foreground">— saved, leave blank to keep</span>
          ) : null}
        </Label>
        <Input
          id="uzum-api-key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? "•••••••••• (unchanged)" : "Paste Uzum API key"}
          required={!hasApiKey}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="uzum-webhook-secret">
          Webhook secret{" "}
          {hasWebhookSecret ? (
            <span className="font-normal text-muted-foreground">— saved, leave blank to keep</span>
          ) : null}
        </Label>
        <Input
          id="uzum-webhook-secret"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={hasWebhookSecret ? "•••••••••• (unchanged)" : "Paste webhook signature secret"}
          required={!hasWebhookSecret}
          autoComplete="off"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving || loading}>
          {saving ? "Saving…" : connected ? "Update Uzum credentials" : "Connect Uzum"}
        </Button>
        {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
