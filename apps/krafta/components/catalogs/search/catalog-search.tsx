"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DialogTitle } from "@radix-ui/react-dialog";

type SearchResult = {
  title: string;
  subtitle: string;
  tag: string;
};

const DUMMY_RESULTS: SearchResult[] = [
  {
    title: "Simply Draw: Learn to Draw",
    subtitle: "Illustration course",
    tag: "Featured",
  },
  {
    title: "Vintage Shop",
    subtitle: "Handmade ceramics",
    tag: "Catalog",
  },
  {
    title: "Krafta Essentials",
    subtitle: "Minimal product set",
    tag: "Collection",
  },
  {
    title: "Teplo Fest x Krafta",
    subtitle: "Limited merch drop",
    tag: "Event",
  },
];

export function CatalogSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const results = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return DUMMY_RESULTS;

    return DUMMY_RESULTS.filter((result) =>
      `${result.title} ${result.subtitle} ${result.tag}`
        .toLowerCase()
        .includes(term),
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          aria-label="Open search"
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-sm"
        >
          <Search className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed inset-0 !left-0 !top-0 z-50 h-[100dvh] w-[100dvw] !translate-x-0 !translate-y-0",
          "!max-w-none !rounded-none !border-0 !p-0",
          "bg-background",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        )}
      ><DialogTitle className="sr-only">Catalog Search</DialogTitle>
        <div className="flex h-full w-full flex-col gap-6 sm:p-6">

          <div className="flex items-center gap-3">
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type to search..."
              className="h-12 text-base rounded-none border-0 shadow-none"
            />
            <DialogClose asChild>
              <Button
                type="button"
                aria-label="Close search"
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
            
            
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {results.length === 0 ? (
              <p className="col-span-full p-4 text-sm text-muted-foreground">
                No matches yet. Try another keyword.
              </p>
            ) : (
              results.map((result) => (
                <div
                  key={result.title}
                  className="rounded-lg border bg-card p-4 shadow-xs"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {result.tag}
                  </p>
                  <h3 className="mt-2 text-base font-semibold">
                    {result.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.subtitle}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
