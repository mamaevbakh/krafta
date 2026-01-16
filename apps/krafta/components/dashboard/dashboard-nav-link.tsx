"use client";

import * as React from "react";
import { useState } from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type DashboardNavLinkProps =
  React.ComponentProps<typeof NavigationMenuPrimitive.Link> & {
    isActive?: boolean;
  };

export function DashboardNavLink({
  className,
  isActive,
  children,
  ...props
}: DashboardNavLinkProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover background behind the link */}
      {hovered && (
        <motion.div
          layoutId="nav-pill"
          className="absolute inset-y-1 inset-x-0 my-1 rounded bg-accent/80"
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 20,
            mass: 0.2,
          }}
        />
      )}

      <NavigationMenuPrimitive.Link
        data-slot="navigation-menu-link"
        data-active={isActive ? "true" : undefined}
        className={cn(
          "relative z-10 flex w-full flex-col px-3 py-[13px] text-sm outline-none transition-all",
          "text-[#888] hover:text-accent-foreground data-[active=true]:text-accent-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className,
        )}
        {...props}
      >
        {children}
      </NavigationMenuPrimitive.Link>

      {isActive && (
        <motion.div
          layoutId="dashboard-active-underline"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-secondary-foreground"
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
            mass: 0.2,
          }}
        />
      )}
    </div>
  );
}
