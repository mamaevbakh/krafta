import type { Feature, Section } from "./editions";
import { FeatureMedia } from "./FeatureMedia";
import { Reveal } from "./Reveal";

/** Splits the flat feature list into ordered runs sharing a group label. */
function groupFeatures(features: Feature[]) {
  const runs: { group?: string; items: Feature[] }[] = [];
  for (const feature of features) {
    const last = runs[runs.length - 1];
    if (last && last.group === feature.group) last.items.push(feature);
    else runs.push({ group: feature.group, items: [feature] });
  }
  return runs;
}

function BackToNav({ onCream }: { onCream: boolean }) {
  return (
    <a
      href="#top"
      className={`group mt-16 inline-flex items-center gap-2 text-sm transition-colors ${
        onCream ? "text-ink/60 hover:text-ink" : "text-stone-2 hover:text-cream"
      }`}
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
        <path
          d="M6 10V2m0 0L2.5 5.5M6 2l3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="link-underline">Back to navigation</span>
    </a>
  );
}

export function EditionSection({
  section,
  index,
}: {
  section: Section;
  index: number;
}) {
  const { id, name, narrative, surface, accent, features } = section;
  const onCream = surface === "cream";
  const heroes = features.filter((f) => f.hero);
  const rest = features.filter((f) => !f.hero);
  const number = String(index + 1).padStart(2, "0");

  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      {/* Headline block — always on the black canvas. */}
      <div
        data-surface="canvas"
        data-section-id={id}
        className="flex min-h-[80svh] flex-col justify-center px-5 py-24 sm:px-8 md:min-h-[105svh]"
      >
        <div className="mx-auto w-full max-w-[105rem] xl:pl-[7rem]">
          <Reveal className="flex items-center gap-3">
            <span className="font-serif text-sm tabular-nums" style={{ color: accent }}>
              {number}
            </span>
            <span className="h-px w-14 bg-cream/25" />
          </Reveal>

          <Reveal
            as="h2"
            id={`${id}-heading`}
            delay={60}
            className="headline-1 mt-5"
          >
            {name}
          </Reveal>

          <Reveal
            as="div"
            delay={140}
            className="narrative-1 drop-cap mt-12 max-w-[19ch] text-cream md:mt-20 md:max-w-[24ch]"
          >
            <p>{narrative}</p>
          </Reveal>
        </div>
      </div>

      {/* Feature panel — cream or canvas, depending on the section. */}
      <div
        data-surface={surface}
        data-section-id={id}
        className={`px-5 py-20 sm:px-8 md:py-28 ${
          onCream ? "bg-cream text-ink" : "bg-canvas text-cream"
        }`}
      >
        <div className="mx-auto w-full max-w-[105rem] xl:pl-[7rem]">
          {heroes.map((feature, i) => (
            <Reveal
              as="article"
              key={feature.title}
              className={`grid items-center gap-8 md:grid-cols-2 md:gap-14 ${
                i > 0 ? "mt-20 md:mt-28" : ""
              }`}
            >
              <FeatureMedia
                seed={index * 3 + i}
                accent={accent}
                surface={surface}
                className={i % 2 === 1 ? "md:order-2" : ""}
              />
              <div className="max-w-[46ch]">
                {feature.group && (
                  <p className="label mb-4" style={{ color: accent }}>
                    {feature.group}
                  </p>
                )}
                <h3 className="headline-2">{feature.title}</h3>
                <p
                  className={`narrative-2 mt-5 ${
                    onCream ? "text-ink/70" : "text-stone-1"
                  }`}
                >
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}

          {rest.length > 0 && (
            <div className={heroes.length ? "mt-24 md:mt-32" : ""}>
              {groupFeatures(rest).map((run) => (
                <div key={run.group ?? "ungrouped"} className="mb-12 last:mb-0">
                  {run.group && (
                    <Reveal className="mb-6 flex items-center gap-4">
                      <h3 className="label" style={{ color: accent }}>
                        {run.group}
                      </h3>
                      <span
                        className={`h-px flex-1 ${
                          onCream ? "bg-ink/15" : "bg-cream/15"
                        }`}
                      />
                    </Reveal>
                  )}

                  <ul className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                    {run.items.map((feature, i) => (
                      <Reveal
                        as="li"
                        key={feature.title}
                        delay={Math.min(i, 5) * 45}
                        className={`border-t pt-4 ${
                          onCream ? "border-ink/15" : "border-cream/15"
                        }`}
                      >
                        <h4 className="text-[1.0625rem] font-medium leading-snug tracking-tight">
                          {feature.title}
                        </h4>
                        <p
                          className={`mt-2 text-sm leading-relaxed ${
                            onCream ? "text-ink/60" : "text-stone-2"
                          }`}
                        >
                          {feature.body}
                        </p>
                      </Reveal>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <BackToNav onCream={onCream} />
        </div>
      </div>
    </section>
  );
}
