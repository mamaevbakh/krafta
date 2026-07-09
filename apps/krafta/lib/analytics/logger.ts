import "server-only";
import { SeverityNumber, type Logger } from "@opentelemetry/api-logs";

/**
 * Typed wrapper over the PostHog Logs OpenTelemetry logger configured in
 * instrumentation.ts. That `register()` hook stashes the logger on globalThis at
 * startup; this module reads it back (they're separate module graphs, so
 * globalThis is the bridge).
 *
 * Every method is a safe no-op when logging is unconfigured (no project token)
 * or on the edge runtime where register() skips setup — so callers never need to
 * guard. Server-only: the `server-only` import fails the build if this is ever
 * pulled into a client component.
 *
 * Usage:
 *   import { log } from "@/lib/analytics/logger";
 *   log.info("order placed", { orderId, venueId, totalCents });
 *   log.error("atmos charge failed", { orderId, reason });
 *
 * Attributes become searchable/filterable fields on PostHog's Logs page.
 */
type LogAttributes = Record<string, string | number | boolean>;

function emit(
  severityNumber: SeverityNumber,
  severityText: string,
  body: string,
  attributes?: LogAttributes,
) {
  const logger = (
    globalThis as typeof globalThis & { __posthogLogger?: Logger }
  ).__posthogLogger;
  logger?.emit({ severityNumber, severityText, body, attributes });
}

export const log = {
  debug: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.DEBUG, "DEBUG", body, attributes),
  info: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.INFO, "INFO", body, attributes),
  warn: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.WARN, "WARN", body, attributes),
  error: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.ERROR, "ERROR", body, attributes),
};
