import { EDITION, SECTIONS } from "./editions";
import { Reveal } from "./Reveal";
import { HeroStage } from "./hero/HeroStage";

function Ornament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 12" className={className} aria-hidden="true" fill="none">
      <path d="M0 6h44" stroke="currentColor" strokeWidth="0.75" />
      <path d="M76 6h44" stroke="currentColor" strokeWidth="0.75" />
      <path
        d="M60 1.5c3 2.6 5.5 3.6 8.5 4.5-3 .9-5.5 1.9-8.5 4.5-3-2.6-5.5-3.6-8.5-4.5 3-.9 5.5-1.9 8.5-4.5Z"
        stroke="currentColor"
        strokeWidth="0.75"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <HeroStage>
      <div className="mx-auto flex w-full max-w-[105rem] flex-1 flex-col justify-center">
        <Reveal className="flex items-center gap-4">
          <span className="label text-stone-2">{EDITION.season}</span>
          <Ornament className="h-3 w-24 text-stone-3" />
        </Reveal>

        <Reveal as="h1" delay={80} className="mt-6 max-w-[16ch]">
          <span className="block font-serif text-[clamp(3rem,11.5vw,10.5rem)] leading-[0.86] tracking-[-0.02em]">
            The Renaissance
          </span>
          <span className="block font-serif italic text-[clamp(3rem,11.5vw,10.5rem)] leading-[0.86] tracking-[-0.02em] text-stone-1">
            Edition
          </span>
        </Reveal>

        <Reveal
          as="p"
          delay={160}
          className="narrative-2 mt-10 max-w-[34ch] text-stone-1"
        >
          {EDITION.subtitle}
        </Reveal>
      </div>

      {/* The index — this list is the page's real navigation. */}
      <nav aria-label="Sections" className="mx-auto w-full max-w-[105rem]">
        <Reveal
          delay={220}
          className="grid grid-cols-2 gap-x-8 border-t border-cream/15 pt-5 sm:grid-cols-3 lg:grid-cols-6"
        >
          {SECTIONS.map((section, i) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="group flex items-baseline gap-2 py-1.5 text-sm text-stone-1 transition-colors hover:text-cream"
            >
              <span className="font-serif text-[0.7rem] tabular-nums text-stone-3 transition-colors group-hover:text-purple">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="link-underline">{section.name}</span>
            </a>
          ))}
        </Reveal>
      </nav>
    </HeroStage>
  );
}
