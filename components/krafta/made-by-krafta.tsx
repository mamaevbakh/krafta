"use client";

import { useEffect, useMemo } from "react";
import { motion, useAnimation } from "framer-motion";

type MadeByKraftaBadgeProps = {
  spinDuration?: number; // seconds for one full rotation
  className?: string;
};

const TEXT = "MADE BY KRAFTA • ";

export function MadeByKraftaBadge({
  spinDuration = 18,
  className = "",
}: MadeByKraftaBadgeProps) {
  // repeat the text so the ring feels continuous
  const letters = useMemo(() => Array.from(TEXT.repeat(2)), []);
  const controls = useAnimation();

  // base infinite spin
  useEffect(() => {
    controls.start({
      rotate: 360,
      transition: {
        repeat: Infinity,
        ease: "linear",
        duration: spinDuration,
      },
    });
  }, [controls, spinDuration]);

  // distance from center to the text ring (in px)
  const RADIUS = 30; // tweak together with disc size

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <div className="pointer-events-auto">
        <div
          className={[
            "relative flex h-20 w-20 items-center justify-center rounded-full",
            "bg-white text-neutral-900 shadow-sm",
            "dark:bg-secondary-background dark:text-white",
            className,
          ].join(" ")}
        >
          {/* rotating ring */}
          <motion.div
            className="absolute inset-0 "
            animate={controls}
          >
            {letters.map((letter, index) => {
              const angle = (360 / letters.length) * index;

              return (
                <span
                  key={index}
                  className="absolute left-1/2 top-1/2 text-[9px] font-semibold"
                  style={{
                    transform: `
                      rotate(${angle}deg)
                      translateY(-${RADIUS}px)
                      rotate(${-angle}deg)
                    `,
                    transformOrigin: "center center",
                  }}
                >
                  {letter}
                </span>
              );
            })}
          </motion.div>

          {/* Center "K" */}
          <span className="relative z-10 text-lg font-bold tracking-tight">
            K
          </span>
        </div>
      </div>
    </div>
  );
}