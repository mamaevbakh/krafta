import { createClient } from "@/lib/supabase/server";

import { ModifiersPanel } from "./_components/modifiers-panel";
import type {
  ModifierListRow,
  ModifierListAttachmentRow,
  ModifierListItemOption,
} from "./_components/modifiers-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

/**
 * Modifier-list CRUD page — KRA-85.
 *
 * Lives under the Items tree at `/items/modifiers` per ADR 0002 §2. Replaces
 * the half-baked "Create new modifier list…" affordance inside the Library
 * Inspector that only created a name-only row. From here merchants get full
 * control: add/remove modifiers, set min/max, configure text inputs, flip
 * the `on_by_default` flag per modifier, soft-delete the list.
 *
 * Phase 1 ships default-locale CRUD only. The translation surface for
 * modifier names lives in the Translations workbench (KRA-94 Phase 2) —
 * the `modifier_list_translations` + `modifier_translations` tables already
 * exist from KRA-90 with `source_hash` + `is_ai_translated` columns wired,
 * so the workbench can consume them once Phase 2 enables that tab.
 */
export default async function DashboardModifiersPage({ params }: PageProps) {
  const { orgSlug: _orgSlug, catalogSlug } = await params;
  void _orgSlug; // reserved for future per-panel deep links

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id")
    .eq("slug", catalogSlug)
    .maybeSingle();

  if (!catalog?.id) {
    return (
      <main className="w-full">
        <div className="mx-auto max-w-[1248px] px-6 py-8">
          <p className="text-sm text-muted-foreground">Catalog not found.</p>
        </div>
      </main>
    );
  }

  // Three parallel queries:
  //   1. modifier_lists with nested modifiers — single round-trip via PostgREST
  //      embedding. `referencedTable: "modifiers"` order keeps the nested
  //      rows ordinal-sorted so the editor renders in user-defined order
  //      without a client-side sort.
  //   2. items (id + name) — drives the "Attach to items…" multi-select.
  //      We only need the lightweight pair; the full item shape lives on
  //      /items.
  //   3. item_modifier_lists pairs — used to derive per-list attached-item
  //      counts client-side. Avoids a second nested embed (which would
  //      blow up payload size on catalogs with many items × lists).
  const [listsResponse, itemsResponse, attachmentsResponse] = await Promise.all([
    supabase
      .from("modifier_lists")
      .select(
        "id, name, internal_name, modifier_type, min_selected, max_selected, text_required, max_length, is_active, updated_at, modifiers!modifiers_modifier_list_id_fkey(id, name, price_cents, ordinal, on_by_default, is_active)",
      )
      .eq("catalog_id", catalog.id)
      .order("updated_at", { ascending: false })
      .order("ordinal", { referencedTable: "modifiers", ascending: true }),
    supabase
      .from("items")
      .select("id, name")
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("item_modifier_lists")
      .select("modifier_list_id, item_id")
      .eq("catalog_id", catalog.id)
      .eq("is_active", true),
  ]);

  const lists = (listsResponse.data ?? []) as ModifierListRow[];
  const items = (itemsResponse.data ?? []) as ModifierListItemOption[];
  const attachments = (attachmentsResponse.data ??
    []) as ModifierListAttachmentRow[];

  return (
    <ModifiersPanel
      catalogId={catalog.id}
      catalogSlug={catalogSlug}
      lists={lists}
      items={items}
      attachments={attachments}
    />
  );
}
