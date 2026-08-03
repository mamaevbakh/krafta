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
  /** Serif narrative paragraph, gets the drop cap. */
  narrative: string;
  /** Surface for this section's feature panel. Headlines always sit on the canvas. */
  surface: Surface;
  /** Accent used for the section index number and rules. */
  accent: string;
  features: Feature[];
};

export const EDITION = {
  name: "Shopify Editions",
  season: "Winter '26",
  title: "The Renaissance Edition",
  subtitle: "A new world of commerce. 150+ product updates.",
};

export const OTHER_EDITIONS = [
  { label: "Spring '26", codename: "Everywhere", href: "#", current: false },
  { label: "Winter '26", codename: "Renaissance", href: "#", current: true },
  { label: "Summer '25", codename: "Horizons", href: "#", current: false },
  { label: "Winter '25", codename: "Boring", href: "#", current: false },
];

export const SECTIONS: Section[] = [
  {
    id: "sidekick",
    name: "Sidekick",
    narrative:
      "The AI-powered Shopify expert who's just as obsessed with your business as you are.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Insights, proactively delivered",
        body: "Sidekick Pulse surfaces smart suggestions before you think to ask for them — anomalies in your data, opportunities in your catalog, and the next best action for your store.",
        hero: true,
      },
      {
        title: "Complexity, delegated",
        body: "Generate custom apps and workflow automations from a plain-language description. Sidekick writes the logic, wires the triggers, and hands you something that runs.",
      },
      {
        title: "Designs, refined",
        body: "Edit your theme, generate imagery, and restyle sections conversationally — now from the mobile editor as well as desktop.",
      },
      {
        title: "Tedious tasks, simplified",
        body: "Save prompts as Shortcuts and Skills, then let Sidekick carry a multi-step job through to completion without re-briefing it at every turn.",
      },
      { title: "Voice-powered mobile chat", body: "Talk to Sidekick on the go and get work done between tasks." },
      { title: "Wide-mode", body: "Expand the panel for long-running, detail-heavy sessions." },
      { title: "App discovery", body: "Get pointed at the right app for the job, with Built for Shopify prioritized." },
      { title: "Target selection", body: "Point at an element on the page and tell Sidekick what to change." },
      { title: "Better memory", body: "Context carries across sessions, so you stop repeating yourself." },
      { title: "Money management", body: "Ask about balances, payouts, and spend without leaving the chat." },
      { title: "Block generation", body: "Describe a block and get a working, editable section back." },
    ],
  },
  {
    id: "agentic",
    name: "Agentic",
    narrative:
      "Sell directly in AI chats with built-in tools that syndicate your products to every AI platform.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Shopify Agentic Storefronts",
        body: "Your catalog becomes discoverable and purchasable inside ChatGPT, Copilot, and Perplexity. One toggle syndicates products, inventory, and pricing to the assistants your customers already use — and the sale settles on Shopify.",
        hero: true,
      },
    ],
  },
  {
    id: "online",
    name: "Online",
    narrative:
      "Validate store changes with A/B testing and an AI tool that simulates shopping behavior.",
    surface: "canvas",
    accent: "#5433EB",
    features: [
      {
        title: "Test and time launches with Rollouts",
        body: "Ship a change to a slice of traffic, measure it against the control, and schedule the full launch — without a third-party testing app.",
        hero: true,
      },
      {
        title: "Shopify SimGym",
        body: "Run AI agents through your storefront to simulate real shopping behavior and find the friction before your customers do.",
        hero: true,
      },
      { group: "Themes", title: "Manage store details in the theme editor", body: "Edit store-wide settings without switching contexts." },
      { group: "Themes", title: "Theme generation on mobile", body: "Generate and preview a full theme from your phone." },
      { group: "Themes", title: "250+ Horizon improvements", body: "Performance, accessibility, and layout refinements across the theme." },
      { group: "Themes", title: "Improved theme discovery", body: "Find the right theme faster, filtered by what you actually sell." },
      { group: "Themes", title: "AI-generated theme before signup", body: "See your store rendered before you create an account." },
      { group: "Catalog", title: "2048 variants per product", body: "Model deep catalogs without splitting products apart." },
      { group: "Catalog", title: "Unlisted product status", body: "Publish a product that's reachable by link but hidden from browse." },
      { group: "Catalog", title: "Collections improvements", body: "Faster, more flexible rules for how products group together." },
      { group: "Catalog", title: "Automatic discounts for eligible customers", body: "Apply the right price to the right buyer, automatically." },
      { group: "Catalog", title: "Compare-at prices in catalogs", body: "Show savings consistently across every catalog you publish." },
      { group: "Catalog", title: "Bundle options combining", body: "Merge shared options so bundles read as one clean choice." },
      { group: "Catalog", title: "Unit pricing globally", body: "Per-unit pricing now available in every market." },
      { group: "Build", title: "Sell on WordPress", body: "Drop Shopify commerce into an existing WordPress site." },
      { group: "Build", title: "Vibe code with Lovable", body: "Prompt a storefront into existence and connect it to your catalog." },
      { group: "Build", title: "Tinker", body: "A new app for experimenting against your store's data safely." },
      { group: "Build", title: "AI-powered domain discovery", body: "Describe the brand, get names that are actually available." },
      { group: "Accounts", title: "Autofill passcode on iOS 26", body: "One-tap sign-in from the system keyboard." },
      { group: "Accounts", title: "Faster customer login with Shop", body: "Recognized shoppers skip straight past the form." },
      { group: "Accounts", title: "Social account sign-in", body: "Let customers use the identity they already have." },
      { group: "Accounts", title: "Customers can edit email addresses", body: "Self-serve changes, without a support ticket." },
      { group: "Accounts", title: "Customizable sign-in copy", body: "Say it in your brand's voice, not ours." },
    ],
  },
  {
    id: "retail",
    name: "Retail",
    narrative: "New in-store hardware that provides unwavering reliability.",
    surface: "cream",
    accent: "#5433EB",
    features: [
      {
        title: "POS Hub",
        body: "A wired, powered base for the counter. Hardline connections and dedicated processing mean the lane keeps moving when the Wi-Fi doesn't.",
        hero: true,
      },
      { group: "Hardware", title: "Hub-compatible scanners", body: "Wired scanners that pair and stay paired." },
      { group: "Selling", title: "Subscriptions on POS", body: "Start and manage recurring plans at the counter." },
      { group: "Selling", title: "Quick count with POS", body: "Spot-count stock on the floor without a laptop." },
      { group: "Selling", title: "POS customization editor", body: "Lay out the till screen around how your staff actually work." },
      { group: "Selling", title: "Same-day delivery with Uber Direct", body: "Sell it in store, have it at their door by evening." },
      { group: "Selling", title: "Markets for retail", body: "Run location-specific pricing and catalogs in physical stores." },
      { group: "Payments", title: "Retail payments expansion", body: "Shopify Payments for retail in more countries." },
      { group: "Payments", title: "QR code payments", body: "Let customers pay from their own phone." },
      { group: "Payments", title: "Tap to Pay in additional countries", body: "Turn any supported phone into a terminal." },
      { group: "Payments", title: "Cartes Bancaires acceptance", body: "Accept France's domestic scheme in store." },
      { group: "Returns", title: "Transfer shipment receiving", body: "Check in transfers accurately at the back door." },
      { group: "Returns", title: "Customizable return receipts", body: "Put your policy and branding on the paper." },
      { group: "Returns", title: "Enhanced return visibility", body: "See the full history of a return in one place." },
      { group: "Returns", title: "Refund selections on POS", body: "Pick exactly what's coming back and what's owed." },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    narrative: "Grow your sales with a first-of-its-kind product network.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Shopify Product Network",
        body: "A network that places your products in front of buyers across participating merchants and surfaces — paid on performance, not impressions.",
        hero: true,
      },
      { title: "Shop Campaigns expands to online store", body: "Run acquisition campaigns that land on your own storefront." },
      { title: "Shop Campaigns on more channels", body: "Same budget, more places for it to work." },
      { title: "Shopify Messaging with SMS", body: "Reach customers over SMS alongside email, from one inbox." },
      { title: "Auto-translation for Shopify Forms", body: "Forms render in the shopper's language automatically." },
      { title: "Improved segmentation template search", body: "Find the segment you want without writing the query." },
      { title: "Target all audiences in one campaign", body: "Stop duplicating a campaign per audience." },
      { title: "Segment by product categories", body: "Build audiences from what people actually browse and buy." },
      { title: "Improved email segmentation", body: "Sharper filters, faster previews, fewer sends to the wrong list." },
      { title: "Dynamic product sections in emails", body: "Each recipient sees products chosen for them." },
      { title: "Calendar view for messaging", body: "See the whole send schedule at a glance." },
      { title: "Forms marketing consent", body: "Capture consent cleanly at the point of signup." },
      { title: "Web pixels on customer accounts", body: "Measure behavior in the logged-in experience too." },
    ],
  },
  {
    id: "checkout",
    name: "Checkout",
    narrative:
      "Convert customers with personalized checkout experiences and more payment options.",
    surface: "canvas",
    accent: "#5433EB",
    features: [
      {
        title: "Personalized Shop button",
        body: "The button adapts to the shopper in front of it — recognizing returning Shop users and putting their fastest path to purchase first.",
        hero: true,
      },
      { title: "Checkout customization per market", body: "Different markets, different checkout — without a second store." },
      { title: "Shop Pay Installments in the UK", body: "Pay-over-time now live for UK buyers." },
      { title: "Shop Pay works with Global-e", body: "Keep the fast checkout on cross-border orders." },
      { title: "Apple Pay in Shop Pay", body: "Two accelerated paths, one button." },
      { title: "Shop Pay subscription reminders", body: "Tell customers before the card is charged." },
      { title: "Zero-downtime Payments switching", body: "Move onto Shopify Payments without closing the store." },
      { title: "Streamlined onboarding", body: "Fewer fields between signup and your first sale." },
      { title: "More France payment methods", body: "Local methods French shoppers expect to see." },
      { title: "Klarna in additional countries", body: "Klarna available across more of your markets." },
    ],
  },
  {
    id: "operations",
    name: "Operations",
    narrative:
      "Improve everyday workflows with flexible inventory modeling and trend-spotting analytics.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        title: "Flexible inventory transfers",
        body: "Model how stock actually moves — partial shipments, multi-leg routes, and mid-transit corrections included.",
        hero: true,
      },
      {
        title: "Heatmaps in analytics",
        body: "See where attention concentrates on a page and where it falls off a cliff.",
        hero: true,
      },
      { group: "Analytics", title: "Customizable top items", body: "Define what 'top' means for your business." },
      { group: "Analytics", title: "Bot filtering", body: "Strip non-human traffic out of your numbers." },
      { group: "Analytics", title: "Precise date and time controls", body: "Slice reporting to the hour when it matters." },
      { group: "Analytics", title: "Single-view analytics for multiple stores", body: "One dashboard across every store you run." },
      { group: "Inventory", title: "Comprehensive inventory history", body: "Every adjustment, with who made it and why." },
      { group: "Inventory", title: "Flash sales with multi-location inventory", body: "Sell hard without overselling a location." },
      { group: "Inventory", title: "Smarter inventory safeguards", body: "Guardrails that catch the mistake before it ships." },
      { group: "Orders", title: "More order filtering", body: "Find the orders you need in fewer clicks." },
      { group: "Orders", title: "Edit unfulfilled orders with duties", body: "Change an order without breaking the duty calculation." },
      { group: "Orders", title: "Discounts on fulfilled items", body: "Make it right after the box has already left." },
      { group: "Orders", title: "Bin locations in Order Printer", body: "Pick lists that match your warehouse." },
      { group: "Workflow", title: "Quick sale in the mobile app", body: "Take a sale from your phone in seconds." },
      { group: "Workflow", title: "Updated Apple Watch metrics", body: "The numbers that matter, on your wrist." },
      { group: "Workflow", title: "AI-enhanced chargeback management", body: "Assemble the evidence and respond faster." },
      { group: "Workflow", title: "Password-free login", body: "Get into admin without a password." },
      { group: "Workflow", title: "Flow preview and redesign", body: "See what a workflow will do before it does it." },
      { group: "Workflow", title: "Cancel workflow runs", body: "Stop an in-flight run that's going wrong." },
      { group: "Workflow", title: "Store credit notifications", body: "Tell customers when credit lands." },
      { group: "Workflow", title: "Enhanced Managed Markets", body: "More control over how you sell internationally." },
    ],
  },
  {
    id: "shop-app",
    name: "Shop app",
    narrative:
      "Reach millions of high-intent shoppers with personalized buying experiences.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "Dynamic storefronts",
        body: "Your Shop storefront rearranges itself per shopper, leading with the products that person is most likely to want.",
        hero: true,
      },
      { title: "Deals feed", body: "A dedicated surface for shoppers hunting a discount." },
      { title: "Shoppable videos", body: "Video that carries the product and the buy button with it." },
      { title: "Customizable product pages", body: "Control how your products present inside Shop." },
      { title: "Better product discovery in Shop Minis", body: "Minis surface relevant products more aggressively." },
      { title: "Order tracking in 21 more countries", body: "Post-purchase tracking for more of your buyers." },
    ],
  },
  {
    id: "b2b",
    name: "B2B",
    narrative:
      "Take your wholesale business global, discover new retailers, and get paid in more ways.",
    surface: "canvas",
    accent: "#5433EB",
    features: [
      {
        title: "Shopify Collective goes global",
        body: "Source from and supply to other Shopify merchants across 35 countries, with inventory, pricing, and fulfillment kept in sync.",
        hero: true,
      },
      { group: "Payments", title: "ACH payments for B2B", body: "Bank transfers as a first-class wholesale method." },
      { group: "Payments", title: "Payment requests per fulfillment", body: "Invoice as the goods actually go out." },
      { group: "Payments", title: "Store credit for B2B", body: "Issue and redeem credit on wholesale accounts." },
      { group: "Payments", title: "Dynamic payment terms and deposits", body: "Terms that flex by customer and order size." },
      { group: "Selling", title: "Supplier retailer discovery", body: "Find retailers looking for exactly what you make." },
      { group: "Selling", title: "Pickup in store", body: "Let wholesale buyers collect locally." },
      { group: "Selling", title: "Order review rules", body: "Hold orders that need a human before they're accepted." },
      { group: "Integration", title: "B2B-compatible apps", body: "A growing set of apps that understand wholesale." },
      { group: "Integration", title: "Instant product imports", body: "Bring a catalog in without waiting on a job queue." },
      { group: "Integration", title: "ERP systems integration", body: "Connect the system of record you already run on." },
      { group: "Integration", title: "Improved product import", body: "Cleaner mapping, clearer errors." },
      { group: "Integration", title: "EDI workflow connections", body: "Speak EDI to the partners who require it." },
      { group: "Integration", title: "Horizon theme support", body: "Wholesale storefronts on the newest theme foundation." },
    ],
  },
  {
    id: "finance",
    name: "Finance",
    narrative:
      "Modern financial tools designed for growing your business and getting that coin.",
    surface: "cream",
    accent: "#5433EB",
    features: [
      {
        title: "Shopify Capital flex account",
        body: "Continuous funding you draw against as you need it, priced off your real sales — instead of reapplying for a lump sum every time.",
        hero: true,
      },
      { title: "Automatic transfers in Shopify Balance", body: "Money routes itself where you told it to go." },
      { title: "Staff cards with spend controls", body: "Give the team cards with limits you set." },
      { title: "Shopify Capital in European countries", body: "Funding available across more of Europe." },
      { title: "Track international profit margins", body: "See true margin per market, after FX." },
      { title: "USDC transaction credits", body: "Credits applied on stablecoin transactions." },
      { title: "Same-day ACH transfers", body: "Move money without waiting for tomorrow." },
      { title: "Unified card dispute", body: "One place to handle every dispute." },
      { title: "Increased Shopify Credit rewards cap", body: "Earn more back on the spend you already do." },
      { title: "Dynamic credit limits", body: "Limits that move with your business." },
      { title: "Add checks in Shopify Balance", body: "Deposit a check from the app." },
      { title: "Real-time fraud alerts", body: "Know the moment something looks wrong." },
    ],
  },
  {
    id: "shipping",
    name: "Shipping",
    narrative:
      "Ship confidently and cheetah-fast with more label, partner, and carrier options.",
    surface: "canvas",
    accent: "#8051FF",
    features: [
      {
        title: "FedEx return labels",
        body: "Generate FedEx returns inline, so the customer gets a label the moment the return is approved.",
        hero: true,
      },
      { title: "Default package per variant", body: "Each variant remembers the box it ships in." },
      { title: "Custom sender name on labels", body: "Your name on the label, not ours." },
      { title: "More logistics partners", body: "A wider bench of 3PLs to hand fulfillment to." },
      { title: "Expanded cross-border labels", body: "Buy international labels for more lanes." },
      { title: "More global shipping carriers", body: "New carriers available directly in admin." },
      { title: "In-progress fulfillment status", body: "See what's mid-pick instead of just done or not." },
    ],
  },
  {
    id: "developer",
    name: "Developer",
    narrative: "A completely new way to build for commerce with the power of AI.",
    surface: "cream",
    accent: "#8051FF",
    features: [
      {
        group: "Agentic commerce",
        title: "Build commerce agents",
        body: "A toolkit for building agents that can browse a catalog, build a cart, and complete a purchase on a shopper's behalf.",
        hero: true,
      },
      { group: "Agentic commerce", title: "Shopify Catalog", body: "A queryable catalog surface built for machine consumers." },
      { group: "Agentic commerce", title: "Checkout Kit for web", body: "Embed a real Shopify checkout anywhere you can render a page." },
      { group: "Sidekick", title: "App recommendations", body: "Sidekick recommends apps with Built for Shopify prioritized." },
    ],
  },
];
