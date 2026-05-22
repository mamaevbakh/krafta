"use client";

/**
 * items-panel.tsx — Table view of the catalog items.
 *
 * Visually a dense data table (DataTable wrapper around shadcn Table).
 * Editing + creation route through the SAME unified EditorSheet the
 * Canvas view uses — that's why this component wraps in
 * CanvasWithSelection + mounts an EditorSheet sibling.
 *
 * Before KRA-88 the table mounted its own CreateItemFlowDialog for
 * both create and edit. The dialog is gone; this file is now a thin
 * surface that:
 *
 *   - Renders the DataTable with row-click → setSelectedItemId (opens
 *     EditorSheet in edit mode).
 *   - Renders an "Add item" button → startCreating(firstCategoryId)
 *     (opens EditorSheet in create mode).
 *   - Confirms + dispatches delete via the existing deleteItem action.
 *
 * CanvasWithSelection here mounts a fresh selection state — sibling
 * with the Canvas's instance. Only one view is mounted at a time (the
 * view toggle picks Canvas xor Table), so there's no cross-view state
 * to coordinate.
 */

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { DataTable } from "./data-table";
import { createColumns } from "./columns";
import { Button } from "@/components/ui/button";
import { CanvasWithSelection, useCanvasSelection } from "./canvas-with-selection";
import { CanvasLocaleProvider } from "./locale-context";
import { EditorSheet } from "./editor-sheet";
import { deleteItem } from "./actions";

type LocaleOption = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
};

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

type ItemMedia = {
  id: string;
  item_id: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  kind: "image" | "video";
  title: string | null;
  alt: string | null;
  position: number;
  is_primary: boolean;
};

type ItemsPanelProps = {
  catalogId: string;
  catalogSlug: string;
  orgId: string;
  categories: CatalogCategory[];
  items: Item[];
  locales: LocaleOption[];
  translations: ItemTranslation[];
  media: ItemMedia[];
  modifierLists: Array<{
    id: string;
    name: string;
    modifier_type: "list" | "text";
    min_selected: number;
    max_selected: number | null;
    text_required: boolean;
    max_length: number | null;
    is_active: boolean;
    modifiers: Array<{
      id: string;
      name: string;
      ordinal: number;
      is_active: boolean;
    }>;
  }>;
  itemModifierLists: Array<{
    item_id: string;
    modifier_list_id: string;
    ordinal: number;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
  }>;
  currencySettings: CurrencySettings;
};

export function ItemsPanel(props: ItemsPanelProps) {
  return (
    <main className="w-full">
      <CanvasLocaleProvider locales={props.locales}>
        <CanvasWithSelection
          catalogId={props.catalogId}
          catalogSlug={props.catalogSlug}
          items={props.items}
          categories={props.categories}
          translations={props.translations}
          currencySettings={props.currencySettings}
        >
          <ItemsPanelBody {...props} />
          {/* EditorSheet for both edit (row click) and create
              (Add item button). Same component the Canvas view uses
              — single source of truth for editor UI. */}
          <EditorSheet
            items={props.items}
            categories={props.categories}
            media={props.media}
            translations={props.translations}
            modifierLists={props.modifierLists}
            itemModifierLists={props.itemModifierLists}
            orgId={props.orgId}
            catalogId={props.catalogId}
            catalogSlug={props.catalogSlug}
            currencySettings={props.currencySettings}
          />
        </CanvasWithSelection>
      </CanvasLocaleProvider>
    </main>
  );
}

/**
 * ItemsPanelBody — the visible chrome. Lives INSIDE CanvasWithSelection
 * so useCanvasSelection() resolves. Renders the page header (title +
 * Add item button) and the DataTable.
 */
function ItemsPanelBody({
  catalogId,
  catalogSlug,
  categories,
  items,
  currencySettings,
}: ItemsPanelProps) {
  const router = useRouter();
  const { setSelectedItemId, startCreating } = useCanvasSelection();
  const defaultCategoryId = categories[0]?.id;

  async function handleDeleteItem(item: Item) {
    const shouldDelete = window.confirm(
      `Delete "${item.name}"? This cannot be undone.`,
    );
    if (!shouldDelete) return;

    const result = await deleteItem({
      catalogId,
      catalogSlug,
      itemId: item.id,
    });

    if (!result.ok) {
      toast.error(result.error ?? "Failed to delete item.");
      return;
    }

    toast.success("Item deleted.");
    router.refresh();
  }

  return (
    <>
      <div className="w-full border-b">
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">Items</h1>
          </div>
          <Button
            onClick={() => {
              if (defaultCategoryId) startCreating(defaultCategoryId);
            }}
            disabled={!defaultCategoryId}
          >
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-5 py-4">
        <DataTable
          columns={createColumns(currencySettings, {
            onEdit: (item) => setSelectedItemId(item.id),
            onDelete: (item) => {
              void handleDeleteItem(item);
            },
          })}
          data={items}
          enableStatusTabs
          searchPlaceholder="Search items..."
          onRowClick={(item) => setSelectedItemId(item.id)}
        />
      </div>
    </>
  );
}
