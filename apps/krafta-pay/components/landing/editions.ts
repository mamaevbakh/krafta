/** Which background a block sits on. Drives type colour and the header's colours. */
export type Surface = "canvas" | "cream";

export type Feature = {
  title: string;
  body: string;
  /** Marks a headline feature — rendered large, spanning the grid. */
  hero?: boolean;
  /** Optional grouping label shown above a run of features. */
  group?: string;
};

export type Section = {
  /** Anchor id, also used by the nav. */
  id: string;
  /** Nav label + section headline. */
  name: string;
  /** Large narrative paragraph, gets the drop cap. */
  narrative: string;
  /** Surface for this section's feature panel. Headlines always sit on the canvas. */
  surface: Surface;
  /** Accent used for the section index number and rules. */
  accent: string;
  features: Feature[];
};

export const EDITION = {
  /** Header brand line. */
  name: "Krafta Pay",
  /** Small uppercase line above the hero headline. */
  eyebrow: "Uzbekistan",
  /** Label on the header's dropdown. */
  menu: "Developers",
  /** The oversized line that closes the footer. */
  title: "Recurring billing on your own account.",
  /** Hero paragraph, under the headline. */
  subtitle:
    "Connect your own Atmos or Uzum account. We run the schedule, the retries and the recovery. The money never passes through us.",
};

/** The header dropdown. Every entry goes somewhere that exists. */
export const HEADER_MENU = [
  { label: "API reference", hint: "integrate", href: "/dashboard/docs" },
  { label: "Platform reference", hint: "operate", href: "/dashboard/docs?doc=platform" },
  { label: "Test cards", hint: "sandbox", href: "/test-cards" },
];

export const SECTIONS: Section[] = [
  {
    id: "subscriptions",
    name: "Subscriptions",
    narrative:
      "Charge the same customer every month without building a billing engine to do it.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "The whole lifecycle, not just the first charge",
        body: "Create, renew, pause, resume, cancel, change plan, change card. The states a real subscription passes through are states Krafta Pay already knows how to be in — so your app reads a status instead of reconstructing one.",
        hero: true,
      },
      {
        title: "One call starts a subscription",
        body: "Post a checkout and you get back a hosted page to send the customer to. Everything after that — the first charge, the renewals, the retries — happens without you.",
      },
      {
        title: "Change plan mid-cycle",
        body: "Move a subscriber up or down without cancelling and re-onboarding them.",
      },
      {
        title: "Pause instead of cancel",
        body: "Suspend billing and pick it back up later. The subscription and its card survive.",
      },
      {
        title: "Cancel now or at period end",
        body: "Let them keep what they already paid for, or cut it off today.",
      },
      {
        title: "Statuses you can act on",
        body: "active, past_due, paused, canceled — each one maps to a decision about access.",
      },
      {
        title: "Renewals that survive the night",
        body: "A charge due at 3am is charged at 3am, whether or not anything of yours is awake.",
      },
    ],
  },
  {
    id: "recovery",
    name: "Recovery",
    narrative:
      // Kept under ~80 characters, like every other narrative here: the drop cap
      // floats three lines, and a fourth wraps out to the left margin.
      //
      // Deliberately names no retry date. RETRY_SCHEDULE_DAYS is [3, 7, 14], so
      // a renewal failing on the 1st is retried on the 4th, the 8th and the
      // 15th — never the 5th. The salary-day observation is real; a specific
      // date the scheduler never attempts is not, and this page's whole
      // credibility is that its specifics check out.
      "Uzcard and Humo are debit cards. A decline is usually a date, not a decision.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Retries timed to how people actually get paid",
        body: "A failed renewal is retried after three days, seven days, and fourteen. Then the invoice is marked uncollectible and the subscription goes past_due — rather than hammering a dead card forever and calling that persistence.",
        hero: true,
      },
      {
        title: "The one case a retry can never fix",
        body: "An expired or cancelled card declines on every attempt, however patiently you wait. So a failed payment carries a live link where the customer can settle the outstanding invoice with a different card.",
        hero: true,
      },
      {
        title: "You send the message",
        body: "Your bot has your subscribers' chat ids. We don't. We hand you the link; you send it, on your channel, in your voice.",
      },
      {
        title: "Recovered revenue, counted",
        body: "Money collected on charges that had already failed at least once, reported as its own number.",
      },
      {
        title: "A recovery rate, not a feeling",
        body: "Recovered against still-failing, so you can tell whether any of this is working.",
      },
      {
        title: "past_due, not silence",
        body: "A subscription that stopped paying says so, instead of looking active until someone thinks to check.",
      },
    ],
  },
  {
    id: "checkout",
    name: "Checkout",
    narrative: "A page your customer pays on, in the language they actually read.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Cards entered on the page, not on someone else's",
        body: "With Atmos the card is collected inline and settles synchronously — no redirect out to a bank page the customer has to decide whether to trust, and no wondering whether they ever came back.",
        hero: true,
      },
      {
        title: "Payment links from the dashboard",
        body: "Generate a hosted URL and send it. No integration required to take a first payment.",
      },
      {
        title: "Russian, Uzbek and English",
        body: "The checkout reads in the customer's language, written natively rather than run through a translator.",
      },
      {
        title: "Retry without starting over",
        body: "A declined card can be replaced on the same page, against the same invoice.",
      },
      {
        title: "Your business on the page",
        body: "The name the customer sees is yours — company details captured once, during setup.",
      },
      {
        title: "Somewhere to land",
        body: "Success and failure both return to a page you control.",
      },
    ],
  },
  {
    id: "providers",
    name: "Providers",
    narrative: "You bring your own merchant account. The money settles straight into it.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        title: "Krafta Pay never holds your money",
        body: "Funds move from your customer into your own provider account. We orchestrate the schedule and the retries and nothing else — there is no float, no payout queue, and nothing of yours sitting on our balance sheet waiting to be released.",
        hero: true,
      },
      {
        title: "Atmos",
        body: "Inline card capture, synchronous settlement. The faster of the two to start on.",
      },
      {
        title: "Uzum",
        body: "The customer attaches a card once, then renewals charge it. Redirect on the first bind.",
      },
      {
        title: "Credentials stored encrypted",
        body: "Provider keys are entered once and encrypted at rest, separately per environment.",
      },
      {
        title: "Payme and Click aren't built yet",
        body: "Tell us which one you need and we'll prioritise it. We would rather build against a real integration than guess at one.",
      },
      {
        title: "Test and live kept apart",
        body: "A separate provider account per environment, so a sandbox mistake cannot reach a real card.",
      },
    ],
  },
  {
    id: "customers",
    name: "Customers",
    narrative: "Your user ids, not ours. Nothing to map, nothing to keep in sync.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Reference a customer by the id you already have",
        body: "Pass your own external id and use it everywhere afterwards. Your Telegram user, your account row, your database key — whatever you already call this person is what Krafta Pay calls them too.",
        hero: true,
      },
      {
        title: "Cards saved for renewal",
        body: "The card that paid the first invoice is the card that pays the next one.",
      },
      {
        title: "One customer, many subscriptions",
        body: "Several plans against the same person, each billed on its own schedule.",
      },
      {
        title: "The full billing history",
        body: "Every subscription and every invoice for a customer, on one page.",
      },
      {
        title: "Look them up by yours or ours",
        body: "Search by external id, by email, or by the Krafta Pay id.",
      },
    ],
  },
  {
    id: "plans",
    name: "Plans",
    narrative: "What you charge, how often, and in which currency.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Priced in soʻm, not in a converted approximation",
        body: "Amounts are stored and charged in the currency you actually bill in, at the precision UZS needs. Six and seven figure prices are the normal case here, not an edge one.",
        hero: true,
      },
      {
        title: "Billed on your interval",
        body: "Monthly is the common case; the interval is yours to set.",
      },
      {
        title: "Fiscal codes on the plan",
        body: "SPIC and package codes live where the price does, so a charge already carries what a receipt needs.",
      },
      {
        title: "Change what a subscriber is on",
        body: "Move someone to a different plan without making them sign up again.",
      },
      {
        title: "Plans over the API",
        body: "Read your catalogue programmatically instead of hardcoding prices in two places.",
      },
    ],
  },
  {
    id: "portal",
    name: "Portal",
    narrative:
      "Let subscribers manage their own billing, so your support doesn't have to.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        title: "A page where they handle it themselves",
        body: "Their subscription, their card, their invoices — visible and editable without a message to you and without a billing screen inside your product. You create a session link; we render the rest.",
        hero: true,
      },
      {
        title: "Change the card",
        body: "A new card, attached by the customer, used from the next renewal onward.",
      },
      {
        title: "Cancel and resume",
        body: "Self-serve, under the same rules your own API would apply.",
      },
      {
        title: "Session links from the API",
        body: "Short-lived, scoped to a single customer, generated on demand.",
      },
      {
        title: "Your name, not ours",
        body: "The page is branded as your business, because that is who they think they are paying.",
      },
    ],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    narrative:
      "Know that a renewal landed at 3am without having polled all night to find out.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Eight events, and each one is a decision",
        body: "created, activated, renewed, payment_failed, recovered, canceled, paused, resumed. Grant access on activated, restore it on recovered, revoke it on canceled — mapping event to action is most of the integration.",
        hero: true,
      },
      {
        title: "Signed, so you can trust them",
        body: "Every delivery carries a signature to verify before you act on it.",
      },
      {
        title: "Retried when your endpoint is down",
        body: "A deploy window doesn't cost you the renewal you needed to hear about.",
      },
      {
        title: "Subscribe to none, receive all",
        body: "Including events added later, so a new capability doesn't need a new registration.",
      },
      {
        title: "Inspect what we sent",
        body: "Deliveries and their responses stay visible for when something looks wrong.",
      },
    ],
  },
  {
    id: "api",
    name: "API",
    narrative: "Six steps to a first charge, and only three of them are code.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Small enough to finish in an afternoon",
        body: "Connect a provider, create a plan, take a key. Then: create a checkout, send the customer, listen for the webhook. That is the integration — the rest of the surface is there when you need it, not before.",
        hero: true,
      },
      {
        title: "Bearer keys, test and live at once",
        body: "Both work against the same base URL simultaneously. Going live means swapping a key.",
      },
      {
        title: "Customers, plans, subscriptions, portal sessions",
        body: "Four resources, REST-shaped, with the verbs where you would expect them.",
      },
      {
        title: "Cancel, pause and resume as endpoints",
        body: "Lifecycle actions your app takes directly, not tickets for someone else to action.",
      },
      {
        title: "Errors that name the problem",
        body: "A code and a message you can act on, rather than a 400 and a shrug.",
      },
      {
        title: "Docs written for the integrator",
        body: "The reference opens on the thing you came for, not on internal log taxonomy.",
      },
    ],
  },
  {
    id: "testing",
    name: "Test mode",
    narrative:
      "Integrate against test keys without a second base URL or a second account.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        title: "Test and live, side by side",
        body: "The same host, the same endpoints, two keys. No staging environment to keep in sync with production, and no second login to remember which one you are in.",
        hero: true,
      },
      {
        title: "Published sandbox cards",
        body: "The same cards for every merchant, documented, moving no real money.",
      },
      {
        title: "Cards that fail on purpose",
        body: "An expired card that declines every time, so you can build the recovery path before you need it.",
      },
      {
        title: "Nothing in test touches live",
        body: "Separate data, separate provider credentials, separate keys.",
      },
      {
        title: "Clearly marked",
        body: "Test mode announces itself, so nobody demos a sandbox and calls it revenue.",
      },
    ],
  },
  {
    id: "operations",
    name: "Operations",
    narrative:
      "The numbers you would otherwise rebuild in a spreadsheet every Monday morning.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "MRR, churn and recovered revenue on one screen",
        body: "Not a dashboard for its own sake — three numbers that answer whether the business grew, whether people left, and how much of what nearly walked out the door came back.",
        hero: true,
      },
      {
        title: "Logs for the payment you're arguing about",
        body: "Checkout, webhook, callback and provider events, searchable, for when the customer says they paid.",
      },
      {
        title: "Invoices per customer",
        body: "What was charged, what failed, and what was recovered, in order.",
      },
      {
        title: "Several businesses, one login",
        body: "Switch between organisations without signing out of anything.",
      },
      {
        title: "The dashboard speaks your language too",
        body: "Russian, Uzbek and English — for whoever runs billing, not only for the customer paying it.",
      },
    ],
  },
  {
    id: "compliance",
    name: "Compliance",
    narrative: "The Uzbek paperwork, handled inside the product instead of around it.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        group: "Fiscal",
        title: "Tax codes where the price is",
        body: "SPIC and package codes are set on the plan, so every charge already carries what a fiscal receipt needs. Nobody has to remember to attach them afterwards — afterwards is when they get forgotten.",
        hero: true,
      },
      {
        group: "Fiscal",
        title: "Codes per plan, not per account",
        body: "Different products can carry different classifications.",
      },
      {
        group: "Business",
        title: "ООО, ИП or самозанятый",
        body: "Each legal form asks for the identifier it actually uses, and checks the length.",
      },
      {
        group: "Business",
        title: "Details captured once",
        body: "Setup takes your company details at the start and puts them on the checkout your customers see.",
      },
      {
        group: "Business",
        title: "Setup that knows what you sell",
        body: "Telegram channel, online school, gym, SaaS — the questions adapt and the defaults follow.",
      },
    ],
  },
];
