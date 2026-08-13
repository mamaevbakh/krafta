/**
 * The template catalogue, as the onboarding agent sees it.
 *
 * Duplicated from the console's `lib/mock/data.ts` on purpose: the agent is a
 * separate package and cannot import from the Next app. The SLUGS are the
 * contract — the console resolves whatever this agent proposes back to a real
 * template — so a slug that drifts here produces a proposal the console cannot
 * honour. When templates move into the database (the design's §5), both sides
 * read the rows and this file is deleted.
 *
 * Descriptions are English because they are read by the model, not by the
 * merchant. The merchant sees the console's translated catalogue.
 */
export type TemplateOption = {
  slug: string
  what: string
  bestFor: string
}

export const TEMPLATES: TemplateOption[] = [
  {
    slug: "venue-support",
    what: "Answers customer questions about hours, menu, prices, delivery and order status. Escalates refunds and complaints to a person.",
    bestFor:
      "A café, restaurant, shop or clinic whose customers ask the same handful of questions all day.",
  },
  {
    slug: "order-desk",
    what: "Takes an order in chat, confirms the delivery address, and passes it to the kitchen or counter.",
    bestFor: "A business that currently takes orders by phone or Telegram messages.",
  },
  {
    slug: "ombor-1c",
    what: "Checks stock levels, warns when something is running low, and prepares inventory reports. Reads from 1C or a spreadsheet.",
    bestFor: "A business that keeps inventory and is asked 'do you have X' constantly.",
  },
  {
    slug: "hr-faq",
    what: "Answers staff questions about leave, payroll, schedules and internal policy.",
    bestFor:
      "An employer whose HR person answers the same questions from employees every week.",
  },
  {
    slug: "payment-desk",
    what: "Checks payment status, resends a receipt, and escalates refunds to a person.",
    bestFor: "A business that takes payments and fields 'did my payment go through' questions.",
  },
  {
    slug: "reporting",
    what: "Sends a scheduled summary of sales, orders and stock to Telegram each morning.",
    bestFor: "An owner who wants a daily digest instead of opening a dashboard.",
  },
]

export const TEMPLATE_SLUGS = TEMPLATES.map((t) => t.slug)
