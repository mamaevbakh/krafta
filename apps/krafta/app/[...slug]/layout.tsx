import type { ReactNode } from "react";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  // The `vaul-drawer-wrapper` attribute lets the cart drawer scale + round
  // this element when it opens (iOS-card-stack feel). vaul transforms the
  // node found via this selector; everything visible to the customer must
  // live inside it.
  return (
    <div
      vaul-drawer-wrapper=""
      className="min-h-screen bg-white text-foreground dark:bg-secondary-background"
    >
      {children}
    </div>
  );
}
