"use client";

import { useRef, type ReactNode } from "react";
import { HeroCanvas } from "./HeroCanvas";

/**
 * Pins the hero for the length of its scroll region.
 *
 * Mirrors the source page's structure: a tall scroll container with a sticky
 * full-viewport stage inside it, so scrolling drives the scene while the copy
 * stays put. The stage pins for `scrollVh - 100` viewport heights and then
 * releases on its own, so the next section follows with no gap and no negative
 * margin.
 */
export function HeroStage({
  children,
  scrollVh = 420,
}: {
  children: ReactNode;
  scrollVh?: number;
}) {
  const scrollRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={scrollRef}
      id="top"
      data-surface="canvas"
      // Marks the scrubbing region for the capture scripts, which need to map
      // 0..1 onto this element rather than onto the whole document.
      data-hero-scroll=""
      className="relative"
      style={{ height: `${scrollVh}svh` }}
    >
      <div className="sticky top-0 h-svh overflow-clip">
        <HeroCanvas scrollRef={scrollRef} />
        <div className="relative flex h-full flex-col justify-between px-5 pb-14 pt-[7.5rem] sm:px-8 md:pt-[9rem]">
          {children}
        </div>
      </div>
    </section>
  );
}
