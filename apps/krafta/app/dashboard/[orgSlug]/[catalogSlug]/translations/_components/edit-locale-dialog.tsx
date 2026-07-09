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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/locales/dashboard/context";

import { updateCatalogLocale } from "@/lib/translation/actions";
import { getLocaleDefinition } from "@/lib/locales/registry";

import type { CatalogLocale } from "./languages-sidebar";

/**
 * Edit-locale dialog — currently scoped to `display_name` only.
 *
 * Why so narrow:
 *   - `locale` (BCP-47 code) is immutable after creation. Changing it
 *     would orphan every existing translation row and drift hash.
 *   - `text_direction` comes from the registry, not user input.
 *   - `is_enabled` / `is_default` have dedicated affordances elsewhere
 *     (eye toggle, future set-default action) where they belong.
 *
 * The locale code is shown in the description as read-only context so
 * the merchant knows what they're renaming. A "Reset to native name"
 * shortcut writes back the registry's nativeName — handy for catalogs
 * whose default was created with a placeholder like "en" instead of
 * "English".
 */

export type EditLocaleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  locale: CatalogLocale | null;
  onSaved: () => void;
};

export function EditLocaleDialog({
  open,
  onOpenChange,
  catalogId,
  locale,
  onSaved,
}: EditLocaleDialogProps) {
  const t = useT();
  const [displayName, setDisplayName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Re-prime the input whenever the dialog opens against a new locale.
  React.useEffect(() => {
    if (open && locale) {
      setDisplayName(locale.display_name);
    }
  }, [open, locale]);

  if (!locale) return null;

  const registryDef = getLocaleDefinition(locale.locale);
  const trimmed = displayName.trim();
  const isUnchanged = trimmed === locale.display_name;
  const canSubmit = !submitting && trimmed.length > 0 && !isUnchanged;
  const canResetToNative =
    registryDef && registryDef.nativeName !== trimmed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    const result = await updateCatalogLocale({
      catalogId,
      locale: locale.locale,
      displayName: trimmed,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("translations.locale_renamed", { name: trimmed }));
    onSaved();
  };

  const handleResetToNative = () => {
    if (registryDef) setDisplayName(registryDef.nativeName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("translations.rename_dialog_title")}</DialogTitle>
            <DialogDescription>
              {t("translations.rename_desc_before")}
              <span className="font-mono text-xs">{locale.locale}</span>
              {t("translations.rename_desc_after")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-4">
            <Label
              htmlFor="locale-display-name"
              className="text-sm font-medium"
            >
              {t("translations.display_name_label")}
            </Label>
            <Input
              id="locale-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            {canResetToNative && (
              <button
                type="button"
                onClick={handleResetToNative}
                className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {t("translations.reset_to_native", {
                  name: registryDef!.nativeName,
                })}
              </button>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t("common.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
