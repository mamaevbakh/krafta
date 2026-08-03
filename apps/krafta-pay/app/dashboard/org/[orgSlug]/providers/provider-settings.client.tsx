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
import { ChevronRight, CreditCard, PenLine, Plus, Trash2 } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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

/**
 * Provider setup.
 *
 * Previously this rendered a permanently-visible "Connect or update a provider"
 * form with segmented Provider/Environment pickers, whether or not anything was
 * connected — a settings panel wearing the clothes of a task. A merchant
 * arriving with nothing connected saw a dashed box telling them to use the form
 * below, then a form asking four questions before it asked the only one that
 * matters: which provider?
 *
 * Now it is a task: an empty state with one action, a picker, then a form that
 * only asks for what we cannot already know.
 */
type DialogState =
  | { step: "pick" }
  | { step: "form"; provider: ConnectableProviderId; environment: Environment; existing: boolean }
  | null;

export function ProviderSettingsClient({ orgId }: { orgId: string }) {
  const t = useT();
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const startEdit = useCallback((p: ProviderId, env: Environment) => {
    setDialog({ step: "form", provider: p, environment: env, existing: true });
  }, []);

  if (!orgId) return null;

  return (
    <div className="space-y-8">
      <ConnectedAccounts
        orgId={orgId}
        refreshKey={refreshKey}
        onEdit={startEdit}
        onChanged={refresh}
        onAdd={() => setDialog({ step: "pick" })}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.step === "pick" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("providers.pick.title")}</DialogTitle>
                <DialogDescription>{t("providers.pick.description")}</DialogDescription>
              </DialogHeader>
              <ProviderPicker
                onPick={(provider) =>
                  setDialog({ step: "form", provider, environment: "live", existing: false })
                }
              />
            </>
          ) : dialog?.step === "form" ? (
            <ProviderFormDialog
              orgId={orgId}
              provider={dialog.provider}
              environment={dialog.environment}
              existing={dialog.existing}
              onEnvironmentChange={(environment) =>
                setDialog({ ...dialog, environment })
              }
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
 * The picker. Big tiles, because choosing your acquirer is the single most
 * consequential decision on this page and a `<select>` makes it look like a
 * preference.
 *
 * Providers whose adapter is still a stub are shown, disabled, with a "soon"
 * badge. That is deliberate: a merchant on Payme needs to know we are not
 * hiding it from them, and letting them connect it would produce a checkout
 * that throws at the first charge.
 */
function ProviderPicker({ onPick }: { onPick: (p: ConnectableProviderId) => void }) {
  const t = useT();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CATALOG_ORDER.map((id) => {
        const provider = PROVIDER_CATALOG[id];
        const available = isConnectable(id);
        const { Mark } = provider;

        return (
          <button
            key={id}
            type="button"
            disabled={!available}
            onClick={() => available && onPick(id as ConnectableProviderId)}
            className={cn(
              "group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors",
              available
                ? "hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                : "cursor-not-allowed opacity-55",
            )}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <Mark className={available ? "" : "grayscale"} />
              {!available ? (
                <Badge variant="outline" className="rounded-full text-[11px]">
                  {t("providers.soon")}
                </Badge>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{provider.name}</div>
              <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {t(provider.taglineKey as never)}
              </div>
            </div>
          </button>
        );
      })}
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
  onAdd,
}: {
  orgId: string;
  refreshKey: number;
  onEdit: (p: ProviderId, env: Environment) => void;
  onChanged: () => void;
  onAdd: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }

  // Nothing connected is the FIRST-RUN state, not an error state. One heading,
  // one sentence saying why this matters, one button. The old dashed box told
  // the merchant to "use the form below" — which only works if you already
  // know what a provider is.
  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CreditCard />
          </EmptyMedia>
          <EmptyTitle>{t("providers.empty.title")}</EmptyTitle>
          <EmptyDescription>{t("providers.empty.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onAdd}>
            <Plus className="size-4" />
            {t("providers.add")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t("providers.connected")}</h2>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          {t("providers.add")}
        </Button>
      </div>

      <ItemGroup className="rounded-lg border">
        {rows.map((account, index) => (
          <AccountRow
            key={`${account.provider}-${account.environment}`}
            account={account}
            orgId={orgId}
            onEdit={onEdit}
            onChanged={onChanged}
            isLast={index === rows.length - 1}
          />
        ))}
      </ItemGroup>

      <p className="text-xs text-muted-foreground">{t("providers.env.hint")}</p>
    </section>
  );
}

function AccountRow({
  account,
  orgId,
  onEdit,
  onChanged,
  isLast,
}: {
  account: AccountView;
  orgId: string;
  onEdit: (p: ProviderId, env: Environment) => void;
  onChanged: () => void;
  isLast: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = PROVIDER_CATALOG[account.provider];
  const { Mark } = catalog;
  const isActive = account.status === "active";

  // Only the identifier that distinguishes one account from another. The API
  // base URL used to be shown here and it is the same for every Atmos account —
  // noise dressed as information.
  const detail = account.storeOrTerminal
    ? `${account.provider === "atmos" ? "store" : "terminal"} ${account.storeOrTerminal}`
    : null;

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
    <>
      <Item className={cn(!isLast && "border-b")}>
        <ItemMedia>
          <Mark />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="flex flex-wrap items-center gap-2">
            {catalog.name}
            <Badge
              variant={account.environment === "live" ? "default" : "outline"}
              className={cn("rounded-full", account.environment === "test" && "border-dashed")}
            >
              {account.environment === "live" ? t("providers.env.live") : t("providers.env.test")}
            </Badge>
            {!isActive ? (
              <span className="text-xs text-destructive">{account.status}</span>
            ) : null}
          </ItemTitle>
          {detail ? (
            <ItemDescription className="font-mono text-xs">{detail}</ItemDescription>
          ) : null}
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </ItemContent>
        <ItemActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(account.provider, account.environment)}
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
                <AlertDialogDescription>{t("providers.disconnect.confirm")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("providers.form.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onDisconnect}>
                  {t("providers.disconnect")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      </Item>
    </>
  );
}

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
  onEnvironmentChange,
  onSaved,
}: {
  orgId: string;
  provider: ConnectableProviderId;
  environment: Environment;
  existing: boolean;
  onEnvironmentChange: (env: Environment) => void;
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

      <div className="space-y-1.5">
        <Label>{t("providers.env.label")}</Label>
        <Segmented
          options={[
            { value: "live", label: t("providers.env.live") },
            { value: "test", label: t("providers.env.test") },
          ]}
          value={environment}
          onChange={onEnvironmentChange}
        />
        <p className="text-xs text-muted-foreground">{t("providers.env.hint")}</p>
      </div>

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
