"use client";

import { useEffect, useRef, useState } from "react";

/** Surface of the three.js scene this component drives. */
type HeroSceneLike = {
  load: () => Promise<unknown>;
  resize: () => void;
  setProgress: (p: number) => void;
  setPointer: (x: number, y: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};
type OwnedCanvas = HTMLCanvasElement & { __heroScene?: HeroSceneLike };

/**
 * The three images the hero needs, and where each figure's reaching hand sits
 * inside its own artwork.
 *
 * handUV is in texture coordinates — (0,0) bottom-left, (1,1) top-right — and is
 * what the contact spark is positioned from. Flat figures cannot move an arm, so
 * the hands only meet if the anchors are honest about where they are painted.
 * To measure one: open the cut-out, find the hand's pixel, divide by the image
 * width and height. Note the y flip — a hand 26% down from the top is v = 0.74.
 *
 * charA is mirrored horizontally when drawn, and its anchor is mirrored with it,
 * so measure on the image as generated, not as displayed.
 */
const ASSETS = {
  backdrop: "/hero/assets/backdrop.webp",
  charA: "/hero/assets/char-a.webp",
  charB: "/hero/assets/char-b.webp",
  // Measured from the alpha channel, not guessed — run `npm run measure:hands`
  // after generating new artwork and paste the values it prints.
  charAHandUV: [0.021, 0.752] as [number, number],
  charBHandUV: [0.021, 0.83] as [number, number],
};

/**
 * The WebGL hero: a canvas pinned for the length of `scrollRef`, with scroll
 * position driving a camera timeline and the figures' reach.
 *
 * Everything three.js lives behind a dynamic import so it never enters the
 * server bundle, and the whole thing is progressive — if WebGL is unavailable
 * or the models fail, the page keeps its painted backdrop and the copy on top
 * stays readable.
 */
export function HeroCanvas({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller) return;

    let scene: HeroSceneLike | null = null;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        const { HeroScene } = await import("./HeroScene.js");
        if (cancelled) return;

        // One scene per canvas, owned by the canvas itself. The effect can run
        // more than once (StrictMode in dev, and remounts in general); building
        // a second WebGLRenderer on a canvas that already has a context yields a
        // dead one that never finishes loading, and disposing either instance
        // tears down the context they share.
        const owned = canvas as OwnedCanvas;
        if (owned.__heroScene) {
          scene = owned.__heroScene;
          scene.start();
          setReady(true);
          return;
        }

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const s = new HeroScene({
          canvas,
          assets: ASSETS,
          characterMode: "plane",
          sparkMode: "glow",
          shading: "matte",
          reducedMotion: reduced,
        });
        // Publish the instance BEFORE awaiting the load, so cleanup can dispose
        // it synchronously. Otherwise the first StrictMode instance finishes
        // loading after the second has already built its renderer, and disposing
        // it then tears down the WebGL context they share.
        scene = s;
        (canvas as OwnedCanvas).__heroScene = s;
        await s.load();
        if (cancelled) return;

        const progress = () => {
          const rect = scroller.getBoundingClientRect();
          const total = rect.height - window.innerHeight;
          if (total <= 0) return 0;
          return Math.min(1, Math.max(0, -rect.top / total));
        };

        s.resize();
        s.setProgress(progress());
        s.start();
        setReady(true);

        const onScroll = () => s.setProgress(progress());
        const onResize = () => {
          s.resize();
          s.setProgress(progress());
        };
        const onPointer = (e: PointerEvent) =>
          s.setPointer(
            (e.clientX / window.innerWidth) * 2 - 1,
            (e.clientY / window.innerHeight) * 2 - 1
          );
        const onLeave = () => s.setPointer(0, 0);
        const onVisibility = () => (document.hidden ? s.stop() : s.start());

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize);
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("pointerleave", onLeave, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        cleanups.push(
          () => window.removeEventListener("scroll", onScroll),
          () => window.removeEventListener("resize", onResize),
          () => window.removeEventListener("pointermove", onPointer),
          () => window.removeEventListener("pointerleave", onLeave),
          () => document.removeEventListener("visibilitychange", onVisibility)
        );

        // Stop rendering once the hero has scrolled away.
        const io = new IntersectionObserver(
          ([entry]) => (entry.isIntersecting ? s.start() : s.stop()),
          { threshold: 0 }
        );
        io.observe(canvas);
        cleanups.push(() => io.disconnect());
      } catch (err) {
        console.error("[hero] scene failed, falling back to static backdrop:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      // Detach listeners but keep the scene alive on the canvas. Disposing here
      // would destroy the WebGL context a re-mounted effect is about to reuse.
      scene?.stop();
    };
  }, [scrollRef]);

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-clip">
      {/* Painted backdrop underneath: shows immediately, and remains the hero
          if WebGL is unavailable. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${ASSETS.backdrop})`,
          filter: "brightness(0.62) saturate(0.9)",
          opacity: ready ? 0 : 1,
        }}
      />
      <canvas
        ref={canvasRef}
        className="size-full transition-opacity duration-1000"
        style={{ opacity: ready && !failed ? 1 : 0 }}
      />
      {/* Keeps the copy legible over whichever layer is showing. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.8) 100%)",
        }}
      />
    </div>
  );
}
