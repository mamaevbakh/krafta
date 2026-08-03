import { LandingPage } from "@/components/landing/LandingPage";

// The landing owns its own surface (black canvas, cream type) via the
// `.editions-landing` wrapper, so it does not read the app's light/dark theme.
export default function Home() {
  return <LandingPage />;
}
