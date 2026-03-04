import type { HTMLAttributes } from "react";

type BrandWordmarkProps = HTMLAttributes<HTMLSpanElement> & {
  text?: string;
};

export function BrandWordmark({
  text = "Krafta",
  className = "",
  ...props
}: BrandWordmarkProps) {
  return (
    <span
      className={`font-semibold tracking-tight text-black dark:text-white ${className}`.trim()}
      {...props}
    >
      {text}
    </span>
  );
}
