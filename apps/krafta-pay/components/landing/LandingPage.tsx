import { SECTIONS } from "./editions";
import { ScrollSpyProvider } from "./ScrollSpy";
import { SiteHeader } from "./SiteHeader";
import { SectionRail } from "./SectionRail";
import { Hero } from "./Hero";
import { EditionSection } from "./EditionSection";
import { SiteFooter } from "./SiteFooter";


/**
 * The whole landing page as one component, so a host app can drop it into a
 * route without reassembling the parts:
 *
 *   import { LandingPage } from "@/components/landing/LandingPage";
 *   export default function Page() { return <LandingPage />; }
 *
 * Styles are not imported here: Tailwind 4 resolves @theme at build time, so
 * landing.css is pulled in from app/globals.css, right after the Tailwind
 * import. Moving it to a JS import would leave the page unstyled.
 */
export function LandingPage() {
  return (
    // The wrapper carries the page's own background, text colour and font, so it
    // does not depend on the host styling `body`. Without it, headings that
    // inherit their colour render black on black in an app with default body
    // styles — which is exactly what happened on the first real install.
    <div className="editions-landing">
      <ScrollSpyProvider>
        <SiteHeader />
        <SectionRail />
        <main id="main-content">
          <Hero />
          {SECTIONS.map((section, i) => (
            <EditionSection key={section.id} section={section} index={i} />
          ))}
        </main>
        <SiteFooter />
      </ScrollSpyProvider>
    </div>
  );
}
