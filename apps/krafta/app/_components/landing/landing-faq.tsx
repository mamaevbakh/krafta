/**
 * landing-faq.tsx — questions in a single-open accordion (shadcn primitive).
 * Two-column on desktop: heading anchored left, the list on the right.
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeading } from "./section-heading";
import type { LandingContent } from "./content";

export function LandingFaq({ content }: { content: LandingContent }) {
  const { faq } = content;
  return (
    <section
      id="faq"
      className="scroll-mt-16 border-t border-border bg-secondary-background"
    >
      <div className="mx-auto grid max-w-[1248px] gap-12 px-6 py-20 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <SectionHeading eyebrow={faq.eyebrow} title={faq.heading} />
        <Accordion type="single" collapsible className="w-full">
          {faq.items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
