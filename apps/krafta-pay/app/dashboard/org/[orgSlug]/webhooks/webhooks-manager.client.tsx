"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Endpoint = {
  id: string;
  url: string;
  description: string | null;
  environment: string;
  enabled_events: string[] | null;
  status: string;
  consecutive_failure_count: number;
  created_at: string;
  disabled_at: string | null;
};

type Delivery = {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  last_response_snippet: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

export function WebhooksManager({ orgId, environment }: { orgId: string; environment: string }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [freshSecret, setFreshSecret] = useState<{ endpointId: string; secret: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [endpointsRes, deliveriesRes] = await Promise.all([
        fetch(`/api/dashboard/webhooks?orgId=${orgId}`),
        fetch(`/api/dashboard/webhooks/deliveries?orgId=${orgId}&limit=30`),
      ]);

      const endpointsPayload = (await endpointsRes.json()) as {
        endpoints?: Endpoint[];
        availableEvents?: string[];
        error?: string;
      };
      if (!endpointsRes.ok) throw new Error(endpointsPayload.error ?? "load_failed");

      const deliveriesPayload = (await deliveriesRes.json()) as { deliveries?: Delivery[] };

      setEndpoints(endpointsPayload.endpoints ?? []);
      setAvailableEvents(endpointsPayload.availableEvents ?? []);
      setDeliveries(deliveriesPayload.deliveries ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load webhooks.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || creating) return;

    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId,
          url: url.trim(),
          description: description.trim() || null,
          environment,
          enabledEvents: selectedEvents.length > 0 ? selectedEvents : null,
        }),
      });
      const payload = (await response.json()) as {
        endpoint?: Endpoint;
        secret?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(errorMessage(payload.error));
        return;
      }

      if (payload.endpoint && payload.secret) {
        setFreshSecret({ endpointId: payload.endpoint.id, secret: payload.secret });
      }
      setUrl("");
      setDescription("");
      setSelectedEvents([]);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revealSecret(endpointId: string) {
    const response = await fetch("/api/dashboard/webhooks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId, endpointId, revealSecret: true }),
    });
    const payload = (await response.json()) as { secret?: string };
    if (payload.secret) setFreshSecret({ endpointId, secret: payload.secret });
  }

  async function toggleStatus(endpoint: Endpoint) {
    await fetch("/api/dashboard/webhooks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId,
        endpointId: endpoint.id,
        status: endpoint.status === "enabled" ? "disabled" : "enabled",
      }),
    });
    await load();
  }

  async function removeEndpoint(endpointId: string) {
    await fetch("/api/dashboard/webhooks", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId, endpointId }),
    });
    await load();
  }

  async function retryDelivery(deliveryId: string) {
    await fetch("/api/dashboard/webhooks/deliveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId, deliveryId }),
    });
    await load();
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {freshSecret ? <SecretReveal secret={freshSecret.secret} onDismiss={() => setFreshSecret(null)} /> : null}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add an endpoint</CardTitle>
          <CardDescription>
            Krafta Pay POSTs each event as JSON, signed with a secret you can verify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createEndpoint} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://yourapp.uz/webhooks/krafta"
                type="url"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="webhook-description">Description (optional)</Label>
              <Input
                id="webhook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Telegram bot — grants channel access"
              />
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Events</legend>
              <p className="text-xs text-muted-foreground">
                Select none to receive every event, including ones we add later.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {availableEvents.map((eventType) => {
                  const selected = selectedEvents.includes(eventType);
                  return (
                    <button
                      key={eventType}
                      type="button"
                      onClick={() =>
                        setSelectedEvents((current) =>
                          current.includes(eventType)
                            ? current.filter((value) => value !== eventType)
                            : [...current, eventType],
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs transition-colors",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {eventType}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Button type="submit" disabled={creating || !url.trim()} className="justify-self-start">
              {creating ? "Adding…" : "Add endpoint"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Endpoints</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : endpoints.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No endpoints yet. Without one, your app has to poll the API to learn about renewals and
            failures.
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{endpoint.url}</p>
                  {endpoint.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{endpoint.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant={endpoint.status === "enabled" ? "secondary" : "outline"}>
                      {endpoint.status}
                    </Badge>
                    <Badge variant="outline">{endpoint.environment}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {endpoint.enabled_events?.length
                        ? `${endpoint.enabled_events.length} events`
                        : "all events"}
                    </span>
                    {endpoint.consecutive_failure_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" aria-hidden />
                        {endpoint.consecutive_failure_count} consecutive failures
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => revealSecret(endpoint.id)}>
                    Signing secret
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleStatus(endpoint)}>
                    {endpoint.status === "enabled" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete endpoint"
                    onClick={() => removeEndpoint(endpoint.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Recent deliveries</h2>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RotateCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No deliveries yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium">Response</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-3 py-2 font-mono text-xs">{delivery.event_type}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          delivery.status === "succeeded"
                            ? "secondary"
                            : delivery.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {delivery.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-xs">
                      {delivery.attempt_count}
                    </td>
                    <td className="max-w-[22rem] px-3 py-2 font-mono text-xs text-muted-foreground">
                      {delivery.last_status_code ?? delivery.last_error ?? "—"}
                      {delivery.last_response_snippet ? (
                        <span className="block truncate opacity-70">
                          {delivery.last_response_snippet}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(delivery.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {delivery.status !== "succeeded" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryDelivery(delivery.id)}
                        >
                          Retry
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SecretReveal({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card className="max-w-2xl border-foreground/20">
      <CardHeader>
        <CardTitle className="text-sm">Signing secret</CardTitle>
        <CardDescription>
          Verify the <span className="font-mono">Krafta-Signature</span> header with this. It is
          HMAC-SHA256 over <span className="font-mono">{"{timestamp}.{raw body}"}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs">
          {secret}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Done
        </Button>
      </CardContent>
    </Card>
  );
}

function errorMessage(code: string | undefined) {
  switch (code) {
    case "url_must_be_https":
      return "Endpoint URLs must use https:// — your customers' emails and subscription state travel over this.";
    case "url_invalid":
    case "url_required":
      return "Enter a valid URL.";
    case "pay_credentials_secret_missing":
      return "Server is missing PAY_CREDENTIALS_SECRET, so signing secrets cannot be stored.";
    default:
      return "Could not add the endpoint. Try again.";
  }
}
