"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
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
import { Check, ChevronRight, PenLine, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/locales/context";
import {
  CATALOG_ORDER,
  PROVIDER_CATALOG,
  defaultApiBaseUrl,
  defaultDisplayLabel,
  isConnectable,
  type CatalogProviderId,
  type ConnectableProviderId,
} from "./provider-catalog";

type ProviderId = "atmos" | "uzum";
type Environment = "test" | "live";

const ATMOS_DEFAULT_API_BASE = "https://apigw.atmos.uz";

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

type DialogState =
  | { step: "form"; provider: ConnectableProviderId; environment: Environment; existing: boolean }
  | null;

export function ProviderSettingsClient({
  orgId,
  environment,
}: {
  orgId: string;
  environment: Environment;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (!orgId) return null;

  return (
    <div className="space-y-8">
      <ProviderDirectory
        orgId={orgId}
        environment={environment}
        refreshKey={refreshKey}
        onConnect={(provider, existing) =>
          setDialog({ step: "form", provider, environment, existing })
        }
        onChanged={refresh}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.step === "form" ? (
            <ProviderFormDialog
              orgId={orgId}
              provider={dialog.provider}
              environment={dialog.environment}
              existing={dialog.existing}
              onSaved={() => {
                refresh();
                setDialog(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Every rail we support, in one list, in the environment the merchant is
 * currently looking at.
 *
 * This replaced an empty state with a "connect a provider" button behind which
 * sat a picker dialog. Two problems with that. A merchant who has connected
 * nothing — which is every merchant on day one — was shown a dashed box and a
 * verb, with no way to learn what we actually support without clicking; and the
 * rails we are still building were invisible until you opened the picker, so
 * "do you support Payme?" could only be answered by a salesperson. Showing the
 * whole directory answers that question before it is asked, and connecting
 * becomes one click on the provider you already recognise.
 *
 * ONE ENVIRONMENT AT A TIME. The old list rendered every (provider,
 * environment) pair together, so a merchant in test mode saw their live account
 * sitting in the same list — and the reverse, which is worse: a connected test
 * account read as "we are ready to take money". The page now shows only the
 * environment the sidebar switch is on, and connecting here connects THAT
 * environment. Nothing else on this page asks which one you meant.
 */
function ProviderDirectory({
  orgId,
  environment,
  refreshKey,
  onConnect,
  onChanged,
}: {
  orgId: string;
  environment: Environment;
  refreshKey: number;
  onConnect: (provider: ConnectableProviderId, existing: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  // Loaded rows carry the environment they belong to, and `loading` is derived
  // from whether that matches what we are showing. Tracking a separate boolean
  // meant flipping it inside the effect — and, more importantly, the previous
  // environment's rows stayed on screen through the fetch after a mode switch,
  // which is the one moment this page must never be ambiguous.
  const [loaded, setLoaded] = useState<{
    environment: Environment;
    accounts: Record<string, AccountView>;
  } | null>(null);
  const loading = loaded === null || loaded.environment !== environment;

  useEffect(() => {
    let ignore = false;
    // Only the connectable rails, only this environment. Four fetches became
    // two, and neither can return a row the merchant is not currently looking at.
    Promise.all(
      CATALOG_ORDER.filter(isConnectable).map((p) =>
        fetchAccount(p as ConnectableProviderId, orgId, environment),
      ),
    ).then((results) => {
      if (ignore) return;
      const accounts: Record<string, AccountView> = {};
      for (const row of results) if (row) accounts[row.provider] = row;
      setLoaded({ environment, accounts });
    });
    return () => {
      ignore = true;
    };
  }, [orgId, environment, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{t("providers.directory.title")}</h2>
        <Badge
          variant={environment === "live" ? "default" : "outline"}
          className={cn("rounded-full", environment === "test" && "border-dashed")}
        >
          {environment === "live" ? t("providers.env.live") : t("providers.env.test")}
        </Badge>
      </div>

      {/* One column at 375px — DESIGN.md §Layout makes the phone the primary
          viewport, and these rows carry a logo, a name, a description and a
          control, which do not fit side by side there. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {CATALOG_ORDER.map((id) => (
          <ProviderCard
            key={id}
            providerId={id}
            account={loaded.accounts[id] ?? null}
            orgId={orgId}
            environment={environment}
            onConnect={onConnect}
            onChanged={onChanged}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {environment === "live"
          ? t("providers.directory.hint.live")
          : t("providers.directory.hint.test")}
      </p>
    </section>
  );
}

/**
 * One rail. Three states, and the difference between them has to be readable at
 * a glance, because it is the difference between "you can take money" and "you
 * cannot".
 *
 *   connected  — a tick, the account's own identifier, and the way to change it
 *   available  — a plus; one click opens the credential form for this rail
 *   soon       — visibly present but inert, so "do you support Payme?" is
 *                answered honestly without letting anyone connect a rail whose
 *                adapter would throw at the first charge
 */
function ProviderCard({
  providerId,
  account,
  orgId,
  environment,
  onConnect,
  onChanged,
}: {
  providerId: CatalogProviderId;
  account: AccountView | null;
  orgId: string;
  environment: Environment;
  onConnect: (provider: ConnectableProviderId, existing: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = PROVIDER_CATALOG[providerId];
  const { Mark } = catalog;
  const available = isConnectable(providerId);
  const connected = account !== null;
  const isActive = account?.status === "active";

  const detail = account?.storeOrTerminal
    ? `${account.provider === "atmos" ? "store" : "terminal"} ${account.storeOrTerminal}`
    : null;

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/providers/${providerId}?orgId=${encodeURIComponent(orgId)}&environment=${environment}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409 || json?.error === "provider_in_use") {
        setError(t("providers.inUse"));
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

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        !available && "opacity-55",
      )}
    >
      <Mark className={available ? "" : "grayscale"} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{catalog.name}</span>
          {!available ? (
            <Badge variant="outline" className="rounded-full text-[11px]">
              {t("providers.soon")}
            </Badge>
          ) : null}
          {connected && !isActive ? (
            <span className="text-xs text-destructive">{account.status}</span>
          ) : null}
        </div>

        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {connected && detail ? (
            <span className="font-mono">{detail}</span>
          ) : (
            t(catalog.taglineKey as never)
          )}
        </p>

        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}

        {connected ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConnect(providerId as ConnectableProviderId, true)}
            >
              <PenLine className="size-4" />
              {t("providers.edit")}
            </Button>
            <AlertDialog>
              {/* base-ui takes `render`, not `asChild` — the two look
                  interchangeable and are not. */}
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={t("providers.disconnect")}
                  />
                }
              >
                <Trash2 className="size-4" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("providers.disconnect")} {catalog.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("providers.disconnect.confirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("providers.form.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onDisconnect}>
                    {t("providers.disconnect")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      {/* The affordance sits where the eye lands last, mirroring the row order:
          what it is, then what you can do about it. */}
      {connected ? (
        <span
          aria-label={t("providers.connected")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        >
          <Check className="size-4" aria-hidden />
        </span>
      ) : available ? (
        <Button
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label={`${t("providers.add")} ${catalog.name}`}
          onClick={() => onConnect(providerId as ConnectableProviderId, false)}
        >
          <Plus className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}



/**
 * The credential form, inside the picker dialog.
 *
 * Environment is asked HERE rather than up front, because it only becomes a
 * real question once you know which provider you are connecting — and for most
 * merchants the answer is "live", once, forever.
 */
function ProviderFormDialog({
  orgId,
  provider,
  environment,
  existing,
  onSaved,
}: {
  orgId: string;
  provider: ConnectableProviderId;
  environment: Environment;
  existing: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const catalog = PROVIDER_CATALOG[provider];
  const { Mark } = catalog;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <Mark />
          <div className="min-w-0">
            <DialogTitle>
              {existing
                ? t("providers.form.update", { provider: catalog.name })
                : t("providers.form.title", { provider: catalog.name })}
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              {t(catalog.taglineKey as never)}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {/* Environment is NOT asked here any more. The page is already in one
          mode and the card that opened this dialog was in that mode, so a
          second control could only ever disagree with it — and the cost of
          disagreeing is live credentials filed under test, or the reverse. */}
      <Separator />

      {provider === "atmos" ? (
        <AtmosFields orgId={orgId} environment={environment} onSaved={onSaved} />
      ) : (
        <UzumFields orgId={orgId} environment={environment} onSaved={onSaved} />
      )}
    </>
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
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error, setError, message, setMessage } = useFieldError();
  const [connected, setConnected] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);

  // Pre-filled, not asked. A merchant connecting Atmos has one Atmos account,
  // and the gateway host is the same for live and test — the environment split
  // lives in the credentials. Asking either implies a decision that isn't one.
  const [displayLabel, setDisplayLabel] = useState(defaultDisplayLabel("atmos"));
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl("atmos"));
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
        setDisplayLabel(json?.account?.displayLabel ?? defaultDisplayLabel("atmos"));
        setApiBaseUrl(json?.credentials?.apiBaseUrl ?? defaultApiBaseUrl("atmos"));
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
      <div className="grid gap-1.5">
        <Label htmlFor="atmos-store-id">{t("providers.form.storeId")}</Label>
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
          {t("providers.form.consumerKey")}{" "}
          {hasKey ? (
            <span className="font-normal text-muted-foreground">
              — {t("providers.form.keepSecret")}
            </span>
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
          {t("providers.form.consumerSecret")}{" "}
          {hasSecret ? (
            <span className="font-normal text-muted-foreground">
              — {t("providers.form.keepSecret")}
            </span>
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

      {/* Both fields below are already correct for every merchant we expect.
          They stay editable — a private Atmos gateway is a real thing — but
          asking for them up front turns a two-field task into a four-field one. */}
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground transition-colors marker:content-none hover:text-foreground">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          {t("providers.form.advanced")}
        </summary>
        <div className="mt-4 space-y-4 border-l pl-4">
          <div className="grid gap-1.5">
            <Label htmlFor="atmos-display-label">{t("providers.form.displayLabel")}</Label>
            <Input
              id="atmos-display-label"
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="atmos-api-base">{t("providers.form.apiBaseUrl")}</Label>
            <Input
              id="atmos-api-base"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={ATMOS_DEFAULT_API_BASE}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{t("providers.form.apiBaseHint")}</p>
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving || loading}>
          {saving
            ? t("providers.form.saving")
            : connected
              ? t("providers.form.saveUpdate")
              : t("providers.form.save")}
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
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error, setError, message, setMessage } = useFieldError();
  const [connected, setConnected] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);

  const [displayLabel, setDisplayLabel] = useState(defaultDisplayLabel("uzum"));
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl("uzum"));
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
        setDisplayLabel(json?.account?.displayLabel ?? defaultDisplayLabel("uzum"));
        setApiBaseUrl(json?.credentials?.apiBaseUrl ?? defaultApiBaseUrl("uzum"));
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
