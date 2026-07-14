import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// The gate resolves the caller through the cookie-scoped client from
// @/lib/supabase/server — swap it for a controllable fake. vi.mock is
// hoisted above the imports, hence vi.hoisted for the shared spies.
const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, rpc })),
}));

import {
  mediaPathOrgId,
  requireItemMediaRole,
  requireOrgMediaRole,
} from "./authorize";

const ORG_ID = "11111111-2222-3333-4444-555555555555";

function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { user: null } });
}

/** Minimal stand-in for the service-role client: one row per table. */
function fakeService(rows: {
  items?: { catalog_id: string } | null;
  catalogs?: { org_id: string } | null;
}) {
  return {
    from(table: "items" | "catalogs") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
});

describe("requireOrgMediaRole", () => {
  it("401s without a session and never consults is_org_role", async () => {
    signedOut();
    const auth = await requireOrgMediaRole([ORG_ID]);
    expect(auth).toMatchObject({ ok: false, status: 401 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403s when the caller lacks owner/admin on the org", async () => {
    signedIn();
    rpc.mockResolvedValue({ data: false, error: null });
    const auth = await requireOrgMediaRole([ORG_ID]);
    expect(auth).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed (403) when the role check itself errors", async () => {
    signedIn();
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const auth = await requireOrgMediaRole([ORG_ID]);
    expect(auth).toMatchObject({ ok: false, status: 403 });
  });

  it("passes an owner/admin, checking each org once via is_org_role", async () => {
    signedIn();
    rpc.mockResolvedValue({ data: true, error: null });
    const auth = await requireOrgMediaRole([ORG_ID, ORG_ID]);
    expect(auth).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("is_org_role", {
      _org_id: ORG_ID,
      _roles: ["owner", "admin"],
    });
  });
});

describe("requireItemMediaRole", () => {
  const service = () =>
    fakeService({
      items: { catalog_id: "catalog-1" },
      catalogs: { org_id: ORG_ID },
    });

  it("401s without a session", async () => {
    signedOut();
    const auth = await requireItemMediaRole(service(), "item-1");
    expect(auth).toMatchObject({ ok: false, status: 401 });
  });

  it("404s for an unknown item", async () => {
    signedIn();
    const auth = await requireItemMediaRole(
      fakeService({ items: null }),
      "item-1",
    );
    expect(auth).toMatchObject({ ok: false, status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403s a signed-in caller without a role on the owning org", async () => {
    signedIn();
    rpc.mockResolvedValue({ data: false, error: null });
    const auth = await requireItemMediaRole(service(), "item-1");
    expect(auth).toMatchObject({ ok: false, status: 403 });
  });

  it("authorizes owner/admin against the org resolved from the item's catalog", async () => {
    signedIn();
    rpc.mockResolvedValue({ data: true, error: null });
    const auth = await requireItemMediaRole(service(), "item-1");
    expect(auth).toEqual({ ok: true, catalogId: "catalog-1" });
    expect(rpc).toHaveBeenCalledWith("is_org_role", {
      _org_id: ORG_ID,
      _roles: ["owner", "admin"],
    });
  });
});

describe("mediaPathOrgId", () => {
  it("extracts the org id from a path minted by upload-url", () => {
    expect(
      mediaPathOrgId(
        `org/${ORG_ID}/catalog/cat-1/item/item-1/media/media-1/photo.jpg`,
      ),
    ).toBe(ORG_ID);
  });

  it("rejects paths outside the minted org/<uuid>/catalog/ shape", () => {
    expect(mediaPathOrgId("avatars/user-1.png")).toBeNull();
    expect(mediaPathOrgId(`org/not-a-uuid/catalog/c/x.jpg`)).toBeNull();
    expect(mediaPathOrgId(`prefix/org/${ORG_ID}/catalog/c/x.jpg`)).toBeNull();
    expect(mediaPathOrgId(`org/${ORG_ID}/other/x.jpg`)).toBeNull();
  });
});
