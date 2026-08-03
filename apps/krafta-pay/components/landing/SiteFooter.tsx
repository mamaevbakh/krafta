import { EDITION, SECTIONS } from "./editions";

export function SiteFooter() {
  return (
    <footer
      data-surface="canvas"
      className="border-t border-cream/15 bg-canvas px-5 py-16 text-cream sm:px-8"
    >
      <div className="mx-auto w-full max-w-[105rem]">
        <p className="font-serif text-[clamp(1.75rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.02em]">
          {EDITION.title}
        </p>

        <nav
          aria-label="Sections"
          className="mt-12 grid grid-cols-2 gap-x-8 gap-y-1 border-t border-cream/15 pt-8 sm:grid-cols-3 lg:grid-cols-6"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="py-1 text-sm text-stone-2 transition-colors hover:text-cream"
            >
              <span className="link-underline">{section.name}</span>
            </a>
          ))}
        </nav>

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 font-serif text-xs text-stone-3">
          <span>© Shopify Inc</span>
          <a href="#" className="link-underline transition-colors hover:text-stone-1">
            Terms of Service
          </a>
          <a href="#" className="link-underline transition-colors hover:text-stone-1">
            Privacy Policy
          </a>
        </div>
      </div>
    </footer>
  );
}
