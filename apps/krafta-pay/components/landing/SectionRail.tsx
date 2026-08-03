"use client";

import { SECTIONS } from "./editions";
import { useScrollSpy } from "./ScrollSpy";

/** Persistent index down the left gutter. Desktop only — the hero list covers small screens. */
export function SectionRail() {
  const { surface, activeId } = useScrollSpy();
  const onCream = surface === "cream";
  // The hero stage carries no data-section-id, so a null activeId means the
  // hero still owns the viewport. It already prints its own index across the
  // bottom, and the rail sits directly on top of the display headline — the
  // two were rendering over each other and neither was readable.
  const inHero = activeId === null;

  return (
    <nav
      aria-label="Section index"
      aria-hidden={inHero || undefined}
      className={`fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 transition-[color,opacity] duration-300 xl:block ${
        onCream ? "text-ink" : "text-cream"
      } ${inHero ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <ul className="space-y-1.5">
        {SECTIONS.map((section, i) => {
          const active = activeId === section.id;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active ? "true" : undefined}
                className={`group flex items-center gap-2 text-[0.6875rem] transition-opacity duration-200 ${
                  active ? "opacity-100" : "opacity-35 hover:opacity-75"
                }`}
              >
                <span
                  className={`h-px transition-all duration-300 ${
                    active ? "w-5" : "w-2.5 group-hover:w-4"
                  } ${onCream ? "bg-ink" : "bg-cream"}`}
                />
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="tracking-tight">{section.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
