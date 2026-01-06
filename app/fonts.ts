import localFont from "next/font/local";

export const helveticaNeue = localFont({
  src: [
    {
      path: "../public/fonts/HelveticaNeue-Bold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-brand",
  display: "swap",
});
