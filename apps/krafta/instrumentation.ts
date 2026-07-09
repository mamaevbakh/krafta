/**
 * Server instrumentation — Next.js auto-loads this file's `register()` once at
 * startup. In Next 16 no config flag is needed (the old
 * `experimental.instrumentationHook` is obsolete; setting it now would warn).
 *
 * Sets up PostHog Logs via OpenTelemetry: server-side log records are exported
 * over OTLP/HTTP to PostHog's EU logs endpoint and become searchable on the
 * Logs page. Do NOT emit from here — use the typed `log` helper in
 * lib/analytics/logger.ts, which reads the logger this file stashes on
 * globalThis.
 *
 * Reuses the same project token + host as the analytics SDK
 * (instrumentation-client.ts). Both are NEXT_PUBLIC because the project token is
 * a public, write-only ingestion key. No token set → logging no-ops cleanly,
 * matching the analytics setup.
 */
import type { Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

export function register() {
  // Node.js runtime only — the OTLP/HTTP exporter needs Node APIs, and logs
  // originate server-side. Skips the edge runtime (proxy.ts / middleware).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return;

  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  // PostHog Logs ingestion path is `/i/v1/logs` (NOT `/otlp/v1/logs`, which
  // 404s — some install guides show the wrong path). Host reused from the
  // analytics env var: https://eu.i.posthog.com for EU cloud.
  const exporter = new OTLPLogExporter({
    url: `${host}/i/v1/logs`,
    headers: { Authorization: `Bearer ${token}` },
  });

  // SimpleLogRecordProcessor exports each record as it's emitted. On Vercel's
  // Fluid Compute a function instance can freeze between requests, so a batching
  // processor risks dropping buffered records; immediate export trades a little
  // per-log overhead for not losing logs. Swap to BatchLogRecordProcessor + a
  // forceFlush() hook if log volume ever makes this too chatty.
  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "krafta" }),
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });

  // register() and lib/analytics/logger.ts live in separate module graphs, so
  // globalThis is the bridge between "set up the logger" and "emit a log".
  (globalThis as typeof globalThis & { __posthogLogger?: Logger }).__posthogLogger =
    loggerProvider.getLogger("krafta");
}
