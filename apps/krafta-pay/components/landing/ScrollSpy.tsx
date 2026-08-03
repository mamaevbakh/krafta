"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Surface } from "./editions";

type SpyState = {
  /** Surface of whatever sits under the header right now. */
  surface: Surface;
  /** Id of the section currently under the header, or null while in the hero. */
  activeId: string | null;
  /** 0–1 scroll progress through the document. */
  progress: number;
};

const SpyContext = createContext<SpyState>({
  surface: "canvas",
  activeId: null,
  progress: 0,
});

export function useScrollSpy() {
  return useContext(SpyContext);
}

const HEADER_OFFSET = 72;

export function ScrollSpyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SpyState>({
    surface: "canvas",
    activeId: null,
    progress: 0,
  });
  const frame = useRef(0);

  useEffect(() => {
    const read = () => {
      frame.current = 0;

      const panels = Array.from(
        document.querySelectorAll<HTMLElement>("[data-surface]")
      );

      // The panel crossing the header line wins; fall back to the last one above it.
      let current: HTMLElement | null = null;
      for (const panel of panels) {
        const box = panel.getBoundingClientRect();
        if (box.top <= HEADER_OFFSET && box.bottom > HEADER_OFFSET) {
          current = panel;
          break;
        }
        if (box.top <= HEADER_OFFSET) current = panel;
      }

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;

      setState((prev) => {
        const surface = (current?.dataset.surface as Surface) ?? "canvas";
        const activeId = current?.dataset.sectionId ?? null;
        if (
          prev.surface === surface &&
          prev.activeId === activeId &&
          Math.abs(prev.progress - progress) < 0.001
        ) {
          return prev;
        }
        return { surface, activeId, progress };
      });
    };

    const onScroll = () => {
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return <SpyContext.Provider value={state}>{children}</SpyContext.Provider>;
}
