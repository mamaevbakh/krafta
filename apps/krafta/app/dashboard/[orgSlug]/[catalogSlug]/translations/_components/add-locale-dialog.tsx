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
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

import { addCatalogLocale } from "@/lib/translation/actions";

/**
 * Dialog to add a new locale to a catalog.
 *
 * Inputs:
 *   - locale code (ISO 639-1 lowercase, optionally with -ScriptCode like uz-Latn)
 *   - merchant-friendly display name ("Русский", "O'zbek tili", etc.)
 *   - RTL toggle for Arabic / Persian / Hebrew
 *   - is_default toggle (only available if the catalog has no default yet —
 *     the workbench enforces one-default-per-catalog at the UI level so
 *     merchants don't accidentally orphan their existing translations)
 *
 * Common locale presets in a quick-pick row to reduce typing. Power users
 * can still type any code they want.
 */

export type AddLocaleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  existingLocales: string[];
  hasDefault: boolean;
  onCreated: () => void;
};

type Preset = {
  code: string;
  name: string;
  rtl?: boolean;
};

const PRESETS: Preset[] = [
  { code: "ru", name: "Русский" },
  { code: "uz-Latn", name: "O'zbek tili" },
  { code: "uz-Cyrl", name: "Ўзбек тили" },
  { code: "en", name: "English" },
  { code: "tg-Cyrl", name: "Тоҷикӣ" },
  { code: "kk-Latn", name: "Qazaq tili" },
  { code: "ky", name: "Кыргызча" },
  { code: "ar", name: "العربية", rtl: true },
  { code: "fa", name: "فارسی", rtl: true },
];

export function AddLocaleDialog({
  open,
  onOpenChange,
  catalogId,
  existingLocales,
  hasDefault,
  onCreated,
}: AddLocaleDialogProps) {
  const [locale, setLocale] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [isRtl, setIsRtl] = React.useState(false);
  const [isDefault, setIsDefault] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset form on open.
  React.useEffect(() => {
    if (open) {
      setLocale("");
      setDisplayName("");
      setIsRtl(false);
      setIsDefault(false);
    }
  }, [open]);

  const handlePreset = (preset: Preset) => {
    setLocale(preset.code);
    setDisplayName(preset.name);
    setIsRtl(preset.rtl ?? false);
  };

  const trimmedLocale = locale.trim();
  const trimmedDisplayName = displayName.trim();
  const isDuplicate = existingLocales.includes(trimmedLocale);
  const canSubmit =
    !submitting &&
    trimmedLocale.length >= 2 &&
    trimmedDisplayName.length > 0 &&
    !isDuplicate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    const result = await addCatalogLocale({
      catalogId,
      locale: trimmedLocale,
      displayName: trimmedDisplayName,
      textDirection: isRtl ? "rtl" : "ltr",
      isDefault: isDefault && !hasDefault,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Added ${trimmedDisplayName}`);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a language</DialogTitle>
            <DialogDescription>
              Pick a language to translate this catalog into. Once added, you
              can use AI to translate item names and descriptions automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Preset chips */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Common languages</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.filter((p) => !existingLocales.includes(p.code)).map(
                (preset) => (
                  <Button
                    key={preset.code}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreset(preset)}
                    className="h-7 text-xs font-normal"
                  >
                    {preset.name}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {preset.code}
                    </span>
                  </Button>
                ),
              )}
            </div>
          </div>

          <Field data-invalid={isDuplicate ? true : undefined}>
            <FieldLabel htmlFor="locale-code">
              Language code <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="locale-code"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="ru, uz-Latn, en, ar, ..."
              autoComplete="off"
              spellCheck={false}
            />
            <FieldDescription>
              {isDuplicate
                ? "This language is already in this catalog."
                : "ISO 639 code. Optionally followed by a script tag (e.g. uz-Latn vs uz-Cyrl)."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="locale-display-name">
              Display name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="locale-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="O'zbek tili"
              autoComplete="off"
            />
            <FieldDescription>
              Shown in the sidebar. Use the language&apos;s own name if you can —
              merchants find &ldquo;O&apos;zbek tili&rdquo; clearer than &ldquo;Uzbek&rdquo;.
            </FieldDescription>
          </Field>

          <div className="flex items-start justify-between gap-2 rounded-md border bg-card p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="locale-rtl" className="text-sm font-medium">
                Right-to-left language
              </Label>
              <span className="text-xs text-muted-foreground">
                Turn on for Arabic, Persian, Hebrew, Urdu. Storefront direction
                support ships in Phase 2.
              </span>
            </div>
            <Switch id="locale-rtl" checked={isRtl} onCheckedChange={setIsRtl} />
          </div>

          {!hasDefault && (
            <div className="flex items-start justify-between gap-2 rounded-md border bg-card p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="locale-default" className="text-sm font-medium">
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

          <DialogFooter className="gap-2">
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
