// Commerce SDK — the reusable, framework-agnostic commerce layer the Krafta
// Studio agent (and future headless surfaces) build on. Seed scope is the
// read-only catalog facade; cart/checkout/order facades land here next,
// always preserving the server-authoritative pricing path. See
// apps/krafta/docs/krafta-studio.md ("free the engine").
export { getCommerceAdminClient } from "./client";
export { getCatalogOverview, type CatalogOverview } from "./catalog";
