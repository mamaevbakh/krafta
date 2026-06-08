import type { Viewport } from "next";

// Mini Apps render inside a fixed webview: lock zoom and extend under the
// Telegram chrome so the storefront feels native. Theme is inherited from the
// root ThemeProvider (system), which follows Telegram's light/dark webview.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function TmaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
