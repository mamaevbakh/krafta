"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/locales/dashboard/context";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import { ModifierListEditorDialog } from "./modifier-list-editor-dialog";
import { ModifierListsTable } from "./modifier-lists-table";
import { AttachToItemsDialog } from "./attach-to-items-dialog";
import {
  deleteModifierList,
  setModifierListActive,
  detachModifierListFromItems,
} from "./actions";

/**
 * ModifiersPanel — KRA-85 main client wrapper.
 *
 * Single-page CRUD: list view on top, sheet-based editor slides over from
 * the right for create/edit, dialog for "Attach to items…". Matches the
 * Categories panel pattern (header + table + create button) so a merchant
 * who knows /items/categories needs zero new vocabulary here.
 *
 * Phase 1 ships default-locale only. The Translations workbench (KRA-94)
 * picks up the modifier-list / modifier translation tables added by KRA-90.
 */

// ============================================================================
// Types (mirrored to page.tsx for the RSC → client handoff)
// ============================================================================

export type ModifierKindRow = "list" | "text";

export type ModifierRowFromDb = {
  id: string;
  name: string;
  price_cents: number;
  ordinal: number;
  on_by_default: boolean;
  is_active: boolean;
};

export type ModifierListRow = {
  id: string;
  name: string;
  internal_name: string | null;
  modifier_type: ModifierKindRow;
  min_selected: number;
  max_selected: number | null;
  text_required: boolean;
  max_length: number | null;
  is_active: boolean;
  updated_at: string;
  modifiers: ModifierRowFromDb[] | null;
};

export type ModifierListAttachmentRow = {
  modifier_list_id: string;
  item_id: string;
};

export type ModifierListItemOption = {
  id: string;
  name: string;
};

// ============================================================================
// Panel
// ============================================================================

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; list: ModifierListRow };

type AttachState =
  | { mode: "closed" }
  | { mode: "open"; list: ModifierListRow };

export function ModifiersPanel({
  catalogId,
  catalogSlug,
  lists,
  items,
  attachments,
  currencySettings,
}: {
  catalogId: string;
  catalogSlug: string;
  /** Reserved for future deep-links back to other catalog surfaces; the
   *  panel itself doesn't use it yet so the prop stays optional. */
  orgSlug?: string;
  lists: ModifierListRow[];
  items: ModifierListItemOption[];
  attachments: ModifierListAttachmentRow[];
  /** Drives the modifier price input format + suffix label. Threaded
   *  through to ModifierListEditorDialog → SortableModifierRow. Same
   *  CurrencySettings the items page uses. */
  currencySettings: CurrencySettings;
}) {
  const router = useRouter();
  const t = useT();
  const [editor, setEditor] = React.useState<EditorState>({ mode: "closed" });
  const [attach, setAttach] = React.useState<AttachState>({ mode: "closed" });
  const [query, setQuery] = React.useState("");

  // Per-list attached-item count + the item ids it's attached to (the dialog
  // needs the ids to preselect). One pass over attachments builds both maps.
  const { attachedCountByList, attachedItemIdsByList } = React.useMemo(() => {
    const counts = new Map<string, number>();
    const ids = new Map<string, Set<string>>();
    for (const a of attachments) {
      counts.set(a.modifier_list_id, (counts.get(a.modifier_list_id) ?? 0) + 1);
      if (!ids.has(a.modifier_list_id)) ids.set(a.modifier_list_id, new Set());
      ids.get(a.modifier_list_id)!.add(a.item_id);
    }
    return { attachedCountByList: counts, attachedItemIdsByList: ids };
  }, [attachments]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.internal_name ?? "").toLowerCase().includes(q),
    );
  }, [lists, query]);

  async function handleToggleActive(list: ModifierListRow) {
    const next = !list.is_active;
    const result = await setModifierListActive({
      catalogId,
      catalogSlug,
      modifierListId: list.id,
      isActive: next,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      next
        ? t("modifiers.toast.list_enabled")
        : t("modifiers.toast.list_disabled"),
    );
    router.refresh();
  }

  async function handleDelete(list: ModifierListRow) {
    // Native confirm matches what categories-panel does. Per the ticket
    // we surface the attached-count via the action's pre-check.
    if (!window.confirm(t("modifiers.delete_confirm", { name: list.name }))) {
      return;
    }
    const result = await deleteModifierList({
      catalogId,
      catalogSlug,
      modifierListId: list.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("modifiers.toast.list_deleted"));
    router.refresh();
  }

  async function handleDetachItem(listId: string, itemId: string) {
    const result = await detachModifierListFromItems({
      catalogId,
      catalogSlug,
      modifierListId: listId,
      itemIds: [itemId],
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("modifiers.toast.detached"));
    router.refresh();
  }

  return (
    <main className="w-full">
      {/* Header — same h-30 + max-w[1248px] pattern as items + categories so
          the user reads it as "another tab inside Items". */}
      <div className="w-full border-b">
        <div className="mx-auto flex h-30 max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              {t("modifiers.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("modifiers.subtitle")}
            </p>
          </div>
          <Button onClick={() => setEditor({ mode: "create" })}>
            <Plus className="size-4" aria-hidden="true" />
            {t("modifiers.new_list")}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-6 py-8">
        {lists.length === 0 ? (
          <EmptyState onCreate={() => setEditor({ mode: "create" })} />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("modifiers.search_placeholder")}
                  className="h-9 pl-8"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {t("modifiers.list_count", { count: filtered.length })}
              </span>
            </div>
            <ModifierListsTable
              lists={filtered}
              attachedCountByList={attachedCountByList}
              onEdit={(list) => setEditor({ mode: "edit", list })}
              onAttach={(list) => setAttach({ mode: "open", list })}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
            />
          </>
        )}
      </div>

      <ModifierListEditorDialog
        open={editor.mode !== "closed"}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        list={editor.mode === "edit" ? editor.list : null}
        currencySettings={currencySettings}
        onOpenChange={(next) => {
          if (!next) setEditor({ mode: "closed" });
        }}
        onSaved={() => {
          setEditor({ mode: "closed" });
          router.refresh();
        }}
      />

      <AttachToItemsDialog
        open={attach.mode === "open"}
        catalogId={catalogId}
        catalogSlug={catalogSlug}
        list={attach.mode === "open" ? attach.list : null}
        items={items}
        attachedItemIds={
          attach.mode === "open"
            ? attachedItemIdsByList.get(attach.list.id) ?? new Set()
            : new Set()
        }
        onOpenChange={(next) => {
          if (!next) setAttach({ mode: "closed" });
        }}
        onAttached={() => {
          setAttach({ mode: "closed" });
          router.refresh();
        }}
        onDetachItem={handleDetachItem}
      />
    </main>
  );
}

// ============================================================================
// EmptyState — "no lists yet" CTA
// ============================================================================

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h2 className="text-sm font-medium">{t("modifiers.empty.title")}</h2>
      <p className="text-xs text-muted-foreground">
        {t("modifiers.empty.description")}
      </p>
      <Button size="sm" onClick={onCreate}>
        <Plus className="size-4" aria-hidden="true" />
        {t("modifiers.new_list")}
      </Button>
    </div>
  );
}
