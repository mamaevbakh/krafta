import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * main-photo-contract.test.ts — locks the "main photo = first photo"
 * invariant on the media route handlers:
 *
 *   • POST appends — new uploads never steal primary from an existing
 *     main photo; the first upload is only promoted when the item has
 *     no primary yet.
 *   • PATCH reorder — whatever row ends up in the first position is
 *     promoted to primary and mirrored onto items.image_path.
 *   • PATCH set-primary — the promoted row also MOVES to the front of
 *     the gallery (positions renumbered), so cards, the dashboard grid
 *     and the detail carousel all lead with the same photo.
 *
 * The route's three collaborators are mocked at the module boundary:
 * the service-role client factory (scriptable fake below), the auth
 * gate (covered by _lib/authorize.test.ts) and the cache bust.
 */

const { createClientMock, requireItemMediaRoleMock, revalidateMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    requireItemMediaRoleMock: vi.fn(),
    revalidateMock: vi.fn(async () => {}),
  }));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
// Only the gate is faked — mediaPathOrgId passes through for real so the
// POST path-ownership check runs against the actual regex. Stubbing the
// session client keeps importing the original module side-effect free.
vi.mock("./_lib/authorize", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_lib/authorize")>()),
  requireItemMediaRole: requireItemMediaRoleMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/catalogs/revalidate", () => ({
  revalidateCatalogByIdAndSlug: revalidateMock,
}));

import { PATCH, POST } from "./route";

const ITEM_ID = "item-1";
// Upload paths must embed the org the auth gate resolves — POST rejects
// foreign-org paths outright (see storage-isolation.test.ts).
const ORG_ID = "11111111-2222-3333-4444-555555555555";

type Write = {
  table: string;
  op: "insert" | "update";
  values: unknown;
  filters: Array<[string, unknown]>;
};

/** Queue marker that makes the next read resolve with an error. */
const readError = (message: string) => ({ __readError: message });

/**
 * Scriptable stand-in for the service-role client. Reads resolve from
 * `selectQueue` in the order the handler issues them (the handlers'
 * query order is deterministic) — a `readError(...)` entry resolves as
 * a PostgREST error. Every insert/update is recorded with its filter
 * chain so tests assert on what would have hit the DB; `failWrite`
 * lets a test fail a specific write.
 */
function fakeDb(
  selectQueue: unknown[],
  failWrite?: (write: Write) => { message: string } | null,
) {
  const writes: Write[] = [];
  const nextRead = () => {
    const entry = selectQueue.shift() ?? null;
    if (
      entry &&
      typeof entry === "object" &&
      "__readError" in (entry as Record<string, unknown>)
    ) {
      return {
        data: null,
        error: { message: (entry as { __readError: string }).__readError },
      };
    }
    return { data: entry, error: null };
  };
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
        eq(column: string, value: unknown) {
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
        // Bare-awaited chains (writes, and the un-limited orderedRows
        // select) resolve here.
        then(
          resolve: (value: {
            data: unknown;
            error: { message: string } | null;
          }) => unknown,
        ) {
          if (mode === "select") {
            return resolve(nextRead());
          }
          const error = (write && failWrite?.(write)) ?? null;
          return resolve({ data: null, error });
        },
      };
      return chain;
    },
  };
  return { client, writes };
}

function upload(id: string) {
  return {
    id,
    storage_path: `org/${ORG_ID}/catalog/c/item/${ITEM_ID}/media/${id}/${id}.png`,
    kind: "image" as const,
  };
}

function postRequest(uploads: unknown[]) {
  return new Request("http://localhost/api/items/media", {
    method: "POST",
    body: JSON.stringify({ itemId: ITEM_ID, uploads }),
  });
}

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/items/media", {
    method: "PATCH",
    body: JSON.stringify({ itemId: ITEM_ID, ...body }),
  });
}

const insertedRows = (writes: Write[]) =>
  writes.find((w) => w.op === "insert" && w.table === "item_media")
    ?.values as Array<{ is_primary: boolean; position: number }>;

const primaryUpdates = (writes: Write[]) =>
  writes.filter(
    (w) =>
      w.table === "item_media" &&
      w.op === "update" &&
      typeof (w.values as { is_primary?: boolean }).is_primary === "boolean",
  );

const itemMirror = (writes: Write[]) =>
  writes.find((w) => w.table === "items" && w.op === "update");

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

describe("POST /api/items/media — append, never steal main", () => {
  it("keeps the existing primary when the item already has one", async () => {
    // Select order: lastMedia position, then existing-primary probe.
    const db = fakeDb([{ position: 3 }, { id: "existing-primary" }]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(postRequest([upload("m4"), upload("m5")]));

    expect(response.status).toBe(200);
    expect(insertedRows(db.writes).map((r) => r.is_primary)).toEqual([
      false,
      false,
    ]);
    expect(insertedRows(db.writes).map((r) => r.position)).toEqual([4, 5]);
    // No demotion, no promotion, no cover rewrite.
    expect(primaryUpdates(db.writes)).toHaveLength(0);
    expect(itemMirror(db.writes)).toBeUndefined();
    expect(revalidateMock).toHaveBeenCalledWith({ catalogId: "catalog-1" });
  });

  it("promotes the first upload when the item has no primary yet", async () => {
    const db = fakeDb([null, null]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(postRequest([upload("m1"), upload("m2")]));

    expect(response.status).toBe(200);
    expect(insertedRows(db.writes).map((r) => r.is_primary)).toEqual([
      true,
      false,
    ]);
    const mirror = itemMirror(db.writes);
    expect(mirror?.values).toMatchObject({
      image_path: upload("m1").storage_path,
    });
    expect(mirror?.filters).toContainEqual(["id", ITEM_ID]);
  });

  it("returns 500 and inserts nothing when the primary probe fails", async () => {
    const db = fakeDb([{ position: 3 }, readError("probe boom")]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(postRequest([upload("m4")]));

    expect(response.status).toBe(500);
    expect(insertedRows(db.writes)).toBeUndefined();
    expect(itemMirror(db.writes)).toBeUndefined();
  });

  it("returns 500 and inserts nothing when the position probe fails", async () => {
    const db = fakeDb([readError("position boom")]);
    createClientMock.mockReturnValue(db.client);

    const response = await POST(postRequest([upload("m4")]));

    expect(response.status).toBe(500);
    expect(insertedRows(db.writes)).toBeUndefined();
  });
});

describe("PATCH /api/items/media reorder — first position becomes main", () => {
  it("promotes the new leading row and mirrors it onto the item cover", async () => {
    // Select order: firstRow probe after the position updates.
    const db = fakeDb([
      { id: "m2", storage_path: "p2.png", alt: null, is_primary: false },
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(
      patchRequest({
        positions: [
          { id: "m2", position: 0 },
          { id: "m1", position: 1 },
        ],
      }),
    );

    expect(response.status).toBe(200);
    const flips = primaryUpdates(db.writes);
    expect(flips).toHaveLength(2);
    // Demote whoever was primary — scoped to THIS item (service role
    // bypasses RLS, so a dropped item_id filter would demote every
    // item's primary across the table).
    expect(flips[0].values).toMatchObject({ is_primary: false });
    expect(flips[0].filters).toContainEqual(["is_primary", true]);
    expect(flips[0].filters).toContainEqual(["item_id", ITEM_ID]);
    // Promote the row now sitting first, same scoping.
    expect(flips[1].values).toMatchObject({ is_primary: true });
    expect(flips[1].filters).toContainEqual(["id", "m2"]);
    expect(flips[1].filters).toContainEqual(["item_id", ITEM_ID]);
    expect(itemMirror(db.writes)?.values).toMatchObject({
      image_path: "p2.png",
    });
  });

  it("returns 500 and skips the cover mirror when the demote fails", async () => {
    const db = fakeDb(
      [{ id: "m2", storage_path: "p2.png", alt: null, is_primary: false }],
      (write) =>
        write.op === "update" &&
        (write.values as { is_primary?: boolean }).is_primary === false
          ? { message: "demote boom" }
          : null,
    );
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(
      patchRequest({
        positions: [
          { id: "m2", position: 0 },
          { id: "m1", position: 1 },
        ],
      }),
    );

    expect(response.status).toBe(500);
    // No promote after a failed demote, no cover rewrite.
    expect(
      primaryUpdates(db.writes).filter(
        (w) => (w.values as { is_primary: boolean }).is_primary === true,
      ),
    ).toHaveLength(0);
    expect(itemMirror(db.writes)).toBeUndefined();
  });

  it("returns 500 when the first-row probe fails after reordering", async () => {
    const db = fakeDb([readError("first-row boom")]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(
      patchRequest({ positions: [{ id: "m2", position: 0 }] }),
    );

    expect(response.status).toBe(500);
    expect(primaryUpdates(db.writes)).toHaveLength(0);
    expect(itemMirror(db.writes)).toBeUndefined();
  });

  it("leaves primary untouched when the leading row is already main", async () => {
    const db = fakeDb([
      { id: "m1", storage_path: "p1.png", alt: null, is_primary: true },
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(
      patchRequest({
        positions: [
          { id: "m1", position: 0 },
          { id: "m2", position: 1 },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(primaryUpdates(db.writes)).toHaveLength(0);
    expect(itemMirror(db.writes)).toBeUndefined();
  });
});

describe("PATCH /api/items/media set-primary — main moves to the front", () => {
  it("renumbers the gallery with the new primary first and mirrors the cover", async () => {
    // Select order: target media row, then the ordered gallery.
    const db = fakeDb([
      { id: "m3", storage_path: "p3.png", alt: "Alt text" },
      [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(patchRequest({ mediaId: "m3" }));

    expect(response.status).toBe(200);
    const flips = primaryUpdates(db.writes);
    expect(flips).toHaveLength(2);
    expect(flips[0].values).toMatchObject({ is_primary: false });
    expect(flips[0].filters).toContainEqual(["item_id", ITEM_ID]);
    expect(flips[1].values).toMatchObject({ is_primary: true });
    expect(flips[1].filters).toContainEqual(["id", "m3"]);
    expect(flips[1].filters).toContainEqual(["item_id", ITEM_ID]);

    // Positions renumbered: target first, others keep relative order.
    const positionWrites = db.writes.filter(
      (w) =>
        w.table === "item_media" &&
        w.op === "update" &&
        typeof (w.values as { position?: number }).position === "number",
    );
    expect(
      positionWrites.map((w) => [
        w.filters.find(([column]) => column === "id")?.[1],
        (w.values as { position: number }).position,
      ]),
    ).toEqual([
      ["m3", 0],
      ["m1", 1],
      ["m2", 2],
    ]);

    expect(itemMirror(db.writes)?.values).toMatchObject({
      image_path: "p3.png",
      image_alt: "Alt text",
    });
  });

  it("skips renumbering for a single-photo gallery", async () => {
    const db = fakeDb([
      { id: "m1", storage_path: "p1.png", alt: null },
      [{ id: "m1" }],
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(patchRequest({ mediaId: "m1" }));

    expect(response.status).toBe(200);
    const positionWrites = db.writes.filter(
      (w) =>
        w.table === "item_media" &&
        w.op === "update" &&
        typeof (w.values as { position?: number }).position === "number",
    );
    expect(positionWrites).toHaveLength(0);
    expect(itemMirror(db.writes)?.values).toMatchObject({
      image_path: "p1.png",
    });
  });

  it("skips renumbering when the target already leads the gallery", async () => {
    const db = fakeDb([
      { id: "m3", storage_path: "p3.png", alt: null },
      [{ id: "m3" }, { id: "m1" }, { id: "m2" }],
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(patchRequest({ mediaId: "m3" }));

    expect(response.status).toBe(200);
    const positionWrites = db.writes.filter(
      (w) =>
        w.table === "item_media" &&
        w.op === "update" &&
        typeof (w.values as { position?: number }).position === "number",
    );
    expect(positionWrites).toHaveLength(0);
    expect(itemMirror(db.writes)?.values).toMatchObject({
      image_path: "p3.png",
    });
  });

  it("returns 500 when the gallery-order probe fails", async () => {
    const db = fakeDb([
      { id: "m3", storage_path: "p3.png", alt: null },
      readError("ordered boom"),
    ]);
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(patchRequest({ mediaId: "m3" }));

    expect(response.status).toBe(500);
    expect(itemMirror(db.writes)).toBeUndefined();
  });

  it("returns 500 and skips the cover mirror when renumbering fails", async () => {
    const db = fakeDb(
      [
        { id: "m3", storage_path: "p3.png", alt: null },
        [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
      ],
      (write) =>
        write.op === "update" &&
        typeof (write.values as { position?: number }).position === "number"
          ? { message: "renumber boom" }
          : null,
    );
    createClientMock.mockReturnValue(db.client);

    const response = await PATCH(patchRequest({ mediaId: "m3" }));

    expect(response.status).toBe(500);
    expect(itemMirror(db.writes)).toBeUndefined();
  });
});
