"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { type DocsIndexItem } from "@/lib/markdoc";
import { cn } from "@/lib/utils";

type DocsNavProps = {
  docs: DocsIndexItem[];
};

export function DocsNav({ docs }: DocsNavProps) {
  const pathname = usePathname();
  const groupedDocs = docs.reduce<Map<string, DocsIndexItem[]>>((acc, doc) => {
    const groupDocs = acc.get(doc.group) ?? [];
    groupDocs.push(doc);
    acc.set(doc.group, groupDocs);
    return acc;
  }, new Map());

  return (
    <nav className="space-y-5">
      {Array.from(groupedDocs.entries()).map(([group, items]) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group}
          </p>
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
