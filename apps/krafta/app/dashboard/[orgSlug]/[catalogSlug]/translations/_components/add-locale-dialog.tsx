"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { addCatalogLocale } from "@/lib/translation/actions";
import { getLocaleDefinition } from "@/lib/locales/registry";

import { LocalePicker } from "./locale-picker";

/**
 * Dialog to add a new locale to a catalog.
 *
 * Simplified shape:
 *   - Picker (grouped: Recommended + All languages) — single source of truth.
 *     Selecting a locale auto-resolves nativeName + direction from the registry,
 *     so merchants never type codes or toggle "is this RTL".
 *   - "Set as default" toggle stays — it's the one choice we can't derive.
 *
 * Layout follows the shadcn scrollable-dialog pattern:
 *   sticky DialogHeader → scrollable body → sticky DialogFooter
 * so on short viewports the picker still has somewhere to live and the
 * Cancel/Add buttons stay reachable.
 */

export type AddLocaleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  existingLocales: string[];
  hasDefault: boolean;
  onCreated: () => void;
};

export function AddLocaleDialog({
  open,
  onOpenChange,
  catalogId,
  existingLocales,
  hasDefault,
  onCreated,
}: AddLocaleDialogProps) {
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  const [isDefault, setIsDefault] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset on open.
  React.useEffect(() => {
    if (open) {
      setSelectedCode(null);
      setIsDefault(false);
    }
  }, [open]);

  const selected = selectedCode ? getLocaleDefinition(selectedCode) : null;
  const canSubmit = !submitting && selected !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selected) return;

    setSubmitting(true);
    const result = await addCatalogLocale({
      catalogId,
      locale: selected.code,
      displayName: selected.nativeName,
      textDirection: selected.direction,
      isDefault: isDefault && !hasDefault,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Added ${selected.nativeName}`);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="border-b px-6 pb-4 pt-6">
            <DialogTitle>Add a language</DialogTitle>
            <DialogDescription>
              Pick a language to translate this catalog into. Once added, AI
              translates item names and descriptions automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="locale-picker" className="text-sm font-medium">
                Language <span className="text-destructive">*</span>
              </Label>
              <LocalePicker
                id="locale-picker"
                value={selectedCode}
                onChange={setSelectedCode}
                excludeCodes={existingLocales}
              />
              {selected?.direction === "rtl" && (
                <p className="text-xs text-muted-foreground">
                  Right-to-left script — storefront direction support ships
                  in Phase 2.
                </p>
              )}
            </div>

            {!hasDefault && (
              <div className="flex items-start justify-between gap-2 rounded-md border bg-card p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label
                    htmlFor="locale-default"
                    className="text-sm font-medium"
                  >
                    Set as default language
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Customers see this language by default. You can change it
                    later from the catalog&apos;s i18n settings.
                  </span>
                </div>
                <Switch
                  id="locale-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 pb-6 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                "Add language"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
