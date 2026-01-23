"use client";

import * as React from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { updateCatalogSettings } from "./actions";

type SettingsPanelProps = {
  catalogId: string;
  catalogSlug: string;
  orgId: string;
  name: string;
  description: string;
  tags: string[];
  logoPath: string;
};

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mergeTags(existing: string[], incoming: string[]) {
  const seen = new Map<string, string>();
  existing.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    seen.set(normalized.toLowerCase(), normalized);
  });
  incoming.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    if (!seen.has(normalized.toLowerCase())) {
      seen.set(normalized.toLowerCase(), normalized);
    }
  });
  return Array.from(seen.values());
}

export function SettingsPanel({
  catalogId,
  catalogSlug,
  orgId,
  name,
  description,
  tags,
  logoPath,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = React.useState("catalog");
  const [catalogName, setCatalogName] = React.useState(name);
  const [catalogDescription, setCatalogDescription] =
    React.useState(description);
  const [catalogTags, setCatalogTags] = React.useState(tags);
  const [tagInput, setTagInput] = React.useState("");
  const [currentLogoPath, setCurrentLogoPath] = React.useState(logoPath);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const logoUrl =
    currentLogoPath && baseUrl
      ? `${baseUrl}/storage/v1/object/public/krafta/${currentLogoPath}`
      : null;

  const handleAddTags = React.useCallback((value: string) => {
    const pieces = value
      .split(",")
      .map((entry) => normalizeTag(entry))
      .filter(Boolean);

    if (!pieces.length) return;

    setCatalogTags((prev) => mergeTags(prev, pieces));
    setTagInput("");
  }, []);

  const handleSave = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatusMessage(null);

      startTransition(async () => {
        const result = await updateCatalogSettings({
          catalogId,
          catalogSlug,
          name: catalogName,
          description: catalogDescription,
          tags: catalogTags,
        });

        if (!result.ok) {
          setStatusMessage(result.error ?? "Unable to update settings.");
          return;
        }

        setStatusMessage("Settings saved.");
      });
    },
    [catalogId, catalogSlug, catalogName, catalogDescription, catalogTags],
  );

  const handleLogoChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setStatusMessage(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("logo", file);
        formData.append("catalogId", catalogId);
        formData.append("orgId", orgId);

        const response = await fetch("/api/catalogs/logo", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json().catch(() => null)) as
          | { logoPath?: string; error?: string }
          | null;

        if (!response.ok) {
          setStatusMessage(
            data?.error ?? "Unable to upload the catalog logo.",
          );
          return;
        }

        if (data?.logoPath) {
          setCurrentLogoPath(data.logoPath);
        }
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Upload failed.",
        );
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [catalogId, orgId],
  );

  const handleLogoRemove = React.useCallback(async () => {
    if (!currentLogoPath) return;
    setStatusMessage(null);
    setIsUploading(true);

    try {
      const response = await fetch("/api/catalogs/logo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, orgId }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setStatusMessage(
          data?.error ?? "Unable to remove the catalog logo.",
        );
        return;
      }

      setCurrentLogoPath("");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Remove failed.",
      );
    } finally {
      setIsUploading(false);
    }
  }, [catalogId, orgId, currentLogoPath]);

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Customize your catalog presentation and metadata.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="lg:w-56">
            <div className="space-y-1">
              {[
                { id: "catalog", label: "Catalog" },
                { id: "account", label: "Account" },
                { id: "organization", label: "Organization" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                    activeTab === tab.id
                      ? "border-foreground/30 bg-foreground/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </aside>

          <section className="flex-1">
            <div className="rounded-xl border border-border bg-card p-6">
              {activeTab !== "catalog" ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {activeTab === "account"
                    ? "Account settings are coming soon."
                    : "Organization settings are coming soon."}
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-6">
                  <FieldSet>
                    <FieldLegend>Catalog</FieldLegend>
                    <FieldDescription>
                      Control how this catalog appears across your storefront.
                    </FieldDescription>
                    <FieldGroup className="mt-6 gap-6">
                      <Field>
                        <FieldLabel>Catalog name</FieldLabel>
                        <Input
                          value={catalogName}
                          onChange={(event) =>
                            setCatalogName(event.target.value)
                          }
                          placeholder="Catalog name"
                        />
                      </Field>

                      <Field>
                        <FieldLabel>Logo</FieldLabel>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="relative h-28 w-28 overflow-hidden rounded-lg border bg-muted/40">
                            {logoUrl ? (
                              <Image
                                src={logoUrl}
                                alt="Catalog logo"
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                No logo
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isUploading}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              {isUploading ? (
                                <>
                                  <Spinner className="size-4" />
                                  Uploading
                                </>
                              ) : (
                                "Upload logo"
                              )}
                            </Button>
                            {logoUrl ? (
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={isUploading}
                                onClick={handleLogoRemove}
                              >
                                Remove
                              </Button>
                            ) : null}
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleLogoChange}
                              className="hidden"
                            />
                          </div>
                        </div>
                        <FieldDescription>
                          Recommended square logo, minimum 256×256.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel>Description</FieldLabel>
                        <Textarea
                          value={catalogDescription}
                          onChange={(event) =>
                            setCatalogDescription(event.target.value)
                          }
                          placeholder="Describe this catalog..."
                          className="min-h-[120px] resize-none"
                        />
                      </Field>

                      <Field>
                        <FieldLabel>Tags</FieldLabel>
                        <Input
                          value={tagInput}
                          onChange={(event) => setTagInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === ",") {
                              event.preventDefault();
                              handleAddTags(tagInput);
                            }
                          }}
                          onBlur={() => handleAddTags(tagInput)}
                          placeholder="Add tags, separated by commas"
                        />
                        <FieldDescription>
                          Tags show up in search and discovery surfaces.
                        </FieldDescription>
                        {catalogTags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {catalogTags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCatalogTags((prev) =>
                                      prev.filter((entry) => entry !== tag),
                                    )
                                  }
                                  className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground"
                                  aria-label={`Remove ${tag}`}
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Field>
                    </FieldGroup>
                  </FieldSet>

                  {statusMessage ? (
                    <p className="text-sm text-muted-foreground">
                      {statusMessage}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-end gap-2">
                    <Button type="submit" disabled={isPending || isUploading}>
                      {isPending ? (
                        <>
                          <Spinner className="size-4" />
                          Saving
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
