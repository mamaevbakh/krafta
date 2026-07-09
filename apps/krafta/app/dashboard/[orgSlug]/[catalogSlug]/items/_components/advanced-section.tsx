"use client";

/**
 * advanced-section.tsx — collapsible "Advanced" group for the item
 * editor. Renders the slug field (and, in the future, any other
 * power-user knobs that don't belong in the main flow) behind a click-
 * to-expand chevron.
 *
 * Shared between EditorForm (edit mode) and DraftEditorForm (create
 * mode) so both surfaces present the slug input identically. Default
 * state is COLLAPSED — most merchants never touch slug; the auto-
 * generated value works fine.
 *
 * The control is fully owned by the parent (slug + setSlug come in
 * as props). This component is presentational chrome around a Field;
 * it doesn't know about the broader form's state or the locale rule.
 */

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/catalogs/slug";
import { useT } from "@/lib/locales/dashboard/context";

export type AdvancedSectionProps = {
  slug: string;
  onSlugChange: (next: string) => void;
  /** Disable slug editing on non-default-locale tabs (URLs aren't
   *  locale-aware). Matches the gate Item type uses. */
  disabled?: boolean;
  /** Prefix for input ids — pass "editor" for edit form,
   *  "draft" for the create form. Keeps htmlFor stable across both
   *  mounts coexisting in the React tree. */
  idPrefix: string;
};

export function AdvancedSection({
  slug,
  onSlugChange,
  disabled,
  idPrefix,
}: AdvancedSectionProps) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-2 text-left",
          "text-sm font-medium text-muted-foreground transition-colors",
          "hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 transition-transform" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0 transition-transform" aria-hidden="true" />
        )}
        <span>{t("items.advanced")}</span>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down",
          "data-[state=closed]:animate-collapsible-up",
        )}
      >
        <div className="flex flex-col gap-5 pt-3">
          <Field data-disabled={disabled ? true : undefined}>
            <FieldLabel htmlFor={`${idPrefix}-slug`}>{t("items.web_link")}</FieldLabel>
            <Input
              id={`${idPrefix}-slug`}
              value={slug}
              onChange={(event) => onSlugChange(event.target.value)}
              onBlur={() => {
                const trimmed = slug.trim();
                if (trimmed) onSlugChange(slugify(trimmed));
              }}
              placeholder={t("items.web_link_placeholder")}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
            />
            <FieldDescription>
              {t("items.web_link_description")}
            </FieldDescription>
          </Field>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
