import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * storage-isolation.test.ts — locks the cross-tenant storage boundary on
 * the media route handlers:
 *
 *   • POST only registers storage paths the upload-url route mints for
 *     the item's OWN org (org/<orgId>/catalog/…) and pins the bucket to
 *     public-assets. Without this, a merchant could register ANOTHER
 *     org's object (any bucket, any path) as media on their own item…
 *   • …and DELETE would then destroy it: the handler feeds item_media
 *     rows to a service-role storage.remove, so only paths in our bucket
 *     whose embedded org id matches the authorized org may reach it.
 *     Rows failing the check still lose their DB row — just not the
 *     underlying object.
 *
 * Same module-boundary mocks as main-photo-contract.test.ts; the fake
 * client additionally records storage.remove calls and delete writes.
 * mediaPathOrgId is deliberately NOT mocked — the real regex decides.
 */

const { createClientMock, requireItemMediaRoleMock, revalidateMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    requireItemMediaRoleMock: vi.fn(),
    revalidateMock: vi.fn(async () => {}),
  }));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("./_lib/authorize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_lib/authorize")>()),
  requireItemMediaRole: requireItemMediaRoleMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/catalogs/revalidate", () => ({
  revalidateCatalogByIdAndSlug: revalidateMock,
}));

import { DELETE, POST } from "./route";

const ITEM_ID = "item-1";
const BUCKET = "public-assets";
/** The org the caller is authorized on (what the auth gate resolves). */
const ORG_ID = "11111111-2222-3333-4444-555555555555";
/** A victim tenant the caller holds NO role on. */
const OTHER_ORG_ID = "99999999-8888-7777-6666-555555555555";

const ownPath = (id: string) =>
  `org/${ORG_ID}/catalog/c/item/${ITEM_ID}/media/${id}/${id}.png`;
const foreignPath = (id: string) =>
  `org/${OTHER_ORG_ID}/catalog/victim/item/their-item/media/${id}/${id}.png`;

type Write = {
  table: string;
  op: "insert" | "update" | "delete";
  values: unknown;
  filters: Array<[string, unknown]>;
};

/**
 * Scriptable service-role client fake, same shape as the one in
 * main-photo-contract.test.ts, extended with delete()/in() (the DELETE
 * handler's row fetch + row delete) and a storage recorder asserting on
 * exactly which paths would have been destroyed.
 */
function fakeDb(selectQueue: unknown[]) {
  const writes: Write[] = [];
  const storageRemovals: Array<{ bucket: string; paths: string[] }> = [];
  const nextRead = () => ({ data: selectQueue.shift() ?? null, error: null });
  const client = {
    from(table: string) {
      let write: Write | null = null;
      let mode: "select" | "write" | null = null;
      const chain: Record<string, unknown> = {
        select() {
          mode = "select";
          return chain;
        },
        insert(values: unknown) {
          write = { table, op: "insert", values, filters: [] };
          writes.push(write);
          mode = "write";
          return chain;
        },
        update(values: unknown) {
          write = { table, op: "update", values, filters: [] };
          writes.push(write);
          mode = "write";
          return chain;
        },
        delete() {
          write = { table, op: "delete", values: null, filters: [] };
          writes.push(write);
          mode = "write";
          return chain;
        },
        eq(column: string, value: unknown) {
          write?.filters.push([column, value]);
          return chain;
        },
        in(column: string, value: unknown) {
          write?.filters.push([column, value]);
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        async maybeSingle() {
          return nextRead();
        },
        then(
          resolve: (value: {
            data: unknown;
            error: { message: string } | null;
          }) => unknown,
        ) {
          if (mode === "select") {
            return resolve(nextRead());
          }
          return resolve({ data: null, error: null });
        },
      };
      return chain;
    },
    storage: {
      from(bucket: string) {
        return {
          async remove(paths: string[]) {
            storageRemovals.push({ bucket, paths });
            return { data: null, error: null };
          },
        };
      },
    },
  };
  return { client, writes, storageRemovals };
}

function postRequest(uploads: unknown[]) {
  return new Request("http://localhost/api/items/media", {
    method: "POST",
    body: JSON.stringify({ itemId: ITEM_ID, uploads }),
  });
}

function deleteRequest(mediaIds: string[]) {
  return new Request("http://localhost/api/items/media", {
    method: "DELETE",
    body: JSON.stringify({ itemId: ITEM_ID, mediaIds }),
  });
}

const insertedRows = (writes: Write[]) =>
  writes.find((w) => w.op === "insert" && w.table === "item_media")
    ?.values as Array<{ bucket: string }> | undefined;

const rowDelete = (writes: Write[]) =>
  writes.find((w) => w.op === "delete" && w.table === "item_media");

beforeEach(() => {
  createClientMock.mockReset();
  requireItemMediaRoleMock.mockReset();
  revalidateMock.mockClear();
  requireItemMediaRoleMock.mockResolvedValue({
    ok: true,
    catalogId: "catalog-1",
    orgId: ORG_ID,
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "service-key";
});

describe("POST /api/items/media — only own-org minted paths register", () => {
  it("403s and writes nothing when a path embeds another org's id", async () => {
    const db = fakeDb([]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(
      postRequest([
        { id: "m1", storage_path: ownPath("m1"), kind: "image" },
        { id: "m2", storage_path: foreignPath("m2"), kind: "image" },
      ]),
    );

    expect(response.status).toBe(403);
    expect(db.writes).toHaveLength(0);
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("403s paths outside the minted org/<uuid>/catalog/ shape", async () => {
    const db = fakeDb([]);
    createClientMock.mockReturnValue(db.client);

    for (const storage_path of [
      "avatars/admin.png",
      `org/not-a-uuid/catalog/c/x.png`,
      `prefix/${ownPath("m1")}`,
    ]) {
      const response = await POST(
        postRequest([{ id: "m1", storage_path, kind: "image" }]),
      );
      expect(response.status).toBe(403);
    }
    expect(db.writes).toHaveLength(0);
  });

  it("pins the bucket to public-assets, ignoring the client-sent value", async () => {
    // Select order: lastMedia position, then existing-primary probe.
    const db = fakeDb([null, null]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(
      postRequest([
        {
          id: "m1",
          bucket: "krafta-pay-receipts",
          storage_path: ownPath("m1"),
          kind: "image",
        },
      ]),
    );

    expect(response.status).toBe(200);
    expect(insertedRows(db.writes)?.map((r) => r.bucket)).toEqual([BUCKET]);
  });
});

describe("DELETE /api/items/media — storage.remove is org-scoped", () => {
  it("removes own-org objects only; foreign rows lose the DB row, not the object", async () => {
    const rows = [
      // Legitimate row: minted for the authorized org, our bucket.
      { id: "m1", storage_path: ownPath("m1"), bucket: BUCKET, is_primary: true },
      // Forged via the old unvalidated POST: victim org's object.
      { id: "m2", storage_path: foreignPath("m2"), bucket: BUCKET, is_primary: false },
      // Forged bucket: own-org-shaped path pointed at another bucket.
      { id: "m3", storage_path: ownPath("m3"), bucket: "krafta-pay-receipts", is_primary: false },
    ];
    // Select order: rows matching mediaIds, then remaining media (none).
    const db = fakeDb([rows, []]);
    createClientMock.mockReturnValue(db.client);

    const response = await DELETE(deleteRequest(["m1", "m2", "m3"]));

    expect(response.status).toBe(200);
    // The victim's object and the foreign bucket never reach remove().
    expect(db.storageRemovals).toEqual([
      { bucket: BUCKET, paths: [ownPath("m1")] },
    ]);
    // All three DB rows are still deleted, scoped to this item.
    const del = rowDelete(db.writes);
    expect(del?.filters).toContainEqual(["item_id", ITEM_ID]);
    expect(del?.filters).toContainEqual(["id", ["m1", "m2", "m3"]]);
    expect(await response.json()).toMatchObject({ ok: true, count: 3 });
  });

  it("never calls storage.remove when no row passes the ownership check", async () => {
    const rows = [
      { id: "m2", storage_path: foreignPath("m2"), bucket: BUCKET, is_primary: false },
    ];
    const db = fakeDb([rows, []]);
    createClientMock.mockReturnValue(db.client);

    const response = await DELETE(deleteRequest(["m2"]));

    expect(response.status).toBe(200);
    expect(db.storageRemovals).toHaveLength(0);
    expect(rowDelete(db.writes)).toBeDefined();
  });
});
