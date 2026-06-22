"use client";

// Side-cannon confetti — fires a 3-second burst from both screen edges the
// moment it mounts. Rendered on the onboarding reveal ("your shop is ready")
// as the shop-created celebration; returns no UI of its own.
//
// Honors prefers-reduced-motion (skips entirely). canvas-confetti was added
// via `shadcn add @magicui/confetti`.

import * as React from "react";
import confetti from "canvas-confetti";

export function ConfettiSideCannons() {
  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const end = Date.now() + 3 * 1000; // 3 seconds
    const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1"];
    let raf = 0;

    const frame = () => {
      if (Date.now() > end) return;
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      });
      raf = requestAnimationFrame(frame);
    };

    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
