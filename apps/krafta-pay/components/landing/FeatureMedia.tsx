import type { Surface } from "./editions";

/**
 * Stand-in for the source page's product videos. Deterministic abstract
 * compositions so a given feature always renders the same artwork.
 */
export function FeatureMedia({
  seed,
  accent,
  surface,
  className = "",
}: {
  seed: number;
  accent: string;
  surface: Surface;
  className?: string;
}) {
  const onCream = surface === "cream";
  const line = onCream ? "#292919" : "#f7f7ee";
  const variant = seed % 4;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl ${
        onCream ? "bg-ink/[0.06]" : "bg-cream/[0.06]"
      } ${className}`}
      style={{ aspectRatio: "16 / 10" }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 320 200"
        className="absolute inset-0 size-full"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`grad-${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {variant === 0 && (
          <g>
            <circle cx="160" cy="100" r="88" fill={`url(#grad-${seed})`} />
            {[30, 52, 74, 96].map((r) => (
              <circle
                key={r}
                cx="160"
                cy="100"
                r={r}
                stroke={line}
                strokeOpacity="0.22"
                strokeWidth="0.75"
              />
            ))}
            <circle cx="160" cy="100" r="7" fill={accent} />
          </g>
        )}

        {variant === 1 && (
          <g>
            <rect width="320" height="200" fill={`url(#grad-${seed})`} />
            {Array.from({ length: 13 }, (_, i) => {
              const h = 22 + ((i * 37) % 96);
              return (
                <rect
                  key={i}
                  x={22 + i * 21}
                  y={158 - h}
                  width="9"
                  height={h}
                  rx="1.5"
                  fill={i % 4 === 1 ? accent : line}
                  fillOpacity={i % 4 === 1 ? 0.9 : 0.2}
                />
              );
            })}
            <path d="M16 158h288" stroke={line} strokeOpacity="0.3" strokeWidth="0.75" />
          </g>
        )}

        {variant === 2 && (
          <g>
            <circle cx="248" cy="46" r="86" fill={`url(#grad-${seed})`} />
            {Array.from({ length: 8 }, (_, row) =>
              Array.from({ length: 13 }, (_, col) => {
                const on = (row * 13 + col * 5) % 7 === 0;
                return (
                  <circle
                    key={`${row}-${col}`}
                    cx={26 + col * 22}
                    cy={26 + row * 21}
                    r={on ? 4.5 : 2}
                    fill={on ? accent : line}
                    fillOpacity={on ? 0.95 : 0.28}
                  />
                );
              })
            )}
          </g>
        )}

        {variant === 3 && (
          <g>
            <rect width="320" height="200" fill={`url(#grad-${seed})`} />
            <path
              d="M12 150c46 0 46-52 92-52s46 34 92 34 46-62 112-62"
              stroke={accent}
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M12 168c46 0 46-30 92-30s46 20 92 20 46-38 112-38"
              stroke={line}
              strokeOpacity="0.35"
              strokeWidth="1"
              fill="none"
            />
            {[12, 104, 196, 308].map((x, i) => (
              <circle key={x} cx={x} cy={[150, 98, 132, 70][i]} r="3.5" fill={accent} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
