# Krafta

**The commerce and payment infrastructure for small businesses in emerging markets.**

Krafta is a modular SaaS platform that enables businesses to create digital catalogs, storefronts, and ordering flows, accept online payments, and interact with customers — without code, without complex integrations, and without external platforms.

Built for SMBs, creators, freelancers, restaurants, retail stores, and service providers — starting with Uzbekistan and Central Asia.

---

## Table of Contents

- [The Problem](#the-problem)
- [Core Features](#core-features)
- [Product Scope (Current)](#product-scope-current)
- [Product Status (Done vs Pending)](#product-status-done-vs-pending)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Apps](#apps)
- [Packages](#packages)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Component System](#component-system)
- [Catalog Layout System](#catalog-layout-system)
- [Payment System](#payment-system)
- [Search Architecture](#search-architecture)
- [Caching Strategy](#caching-strategy)
- [Roadmap](#roadmap)

---

## The Problem

Today, most SMBs face the same issues:

- **Sell via Instagram / Telegram / WhatsApp** — but no structured catalog, no clean checkout, manual payments
- **Existing solutions** (Shopify, marketplaces, POS) — too complex, not localized, no local payment rails
- **Payment providers** — force embedded iFrames, control UX, inflexible for custom flows

**Krafta solves this** by giving businesses ownership of their storefront, UX, and payments — while abstracting complexity.

---

## Core Features

| Feature | Description |
|---------|-------------|
| **Digital Catalogs** | Categories, items, prices, descriptions, media. Mobile-first, SEO-friendly, shareable via link/QR |
| **Online Ordering** | Item selection, order placement, online payment, status tracking |
| **Krafta Pay** | Unified payment layer with native UI. Uzcard, Humo, Visa, Mastercard. Webhooks & callbacks |
| **Admin Dashboard** | CRUD for catalogs, categories, items. Order management, analytics |
| **AI Layer** | Product descriptions, pricing suggestions, catalog structuring, merchant assistant, customer chat |

---

## Product Scope (Current)

Krafta is the merchant-facing product application in this monorepo.

- `apps/krafta` is the main SaaS app merchants use to build and operate catalogs.
- `apps/krafta-pay` is a separate hosted billing infrastructure app that Krafta uses as a client (for subscriptions and hosted checkout).
- In the current architecture, a Krafta merchant upgrades from Krafta, but payment/billing orchestration is executed in Krafta Pay.

This separation is intentional:

- Krafta focuses on catalog UX, dashboard UX, and product features.
- Krafta Pay focuses on provider integrations, hosted checkout, subscriptions, webhooks, and recurring billing.

---

## Product Status (Done vs Pending)

Snapshot date: **February 23, 2026**

### Done (Implemented and usable)

- Authentication with Supabase Auth across the Krafta app.
- Organization + catalog dashboard routing (`/dashboard/[orgSlug]/[catalogSlug]`).
- Catalog CRUD foundations (catalogs, categories, items, media).
- Public catalog rendering via dynamic routes (`/[...slug]`).
- Configurable catalog component/layout system (registry-based variants and per-component tweaks).
- Catalog search foundation (hybrid search APIs and search documents pipeline present in schema/app).
- Billing page integration in Krafta that:
  - shows current billing/entitlement state,
  - requests plans from Krafta Pay,
  - initiates upgrade into hosted checkout.
- Cross-app auth handoff flow (Krafta -> Krafta Pay) implemented at the application level.

### In Progress / Recently Added (Needs production hardening)

- Billing UX polish and error handling across cross-domain auth and redirect edge cases.
- Entitlement enforcement consistency across all premium features (some flows are implemented, but this should be centralized and audited continuously).
- Catalog builder flexibility for component-specific configuration (framework is in place; more UI controls/variants can be added incrementally).

### Pending (Product roadmap / not fully implemented)

- Full order management product experience in Krafta (customer ordering lifecycle, merchant fulfillment tooling) at production-ready scope.
- Advanced analytics and merchant reporting UX.
- Comprehensive taxonomy/category hierarchy UX (nested categories and taxonomy-grade tooling).
- Advanced subscription UX inside Krafta (upgrades/downgrades, proration policies, self-serve billing management beyond MVP integration).
- Multi-product billing integrations beyond Krafta Catalogs as a client of Krafta Pay.

### Product Notes (Important)

- Krafta merchants (e.g. Aladeen) are **customers of Krafta Catalogs**, not merchants inside Krafta Pay provider onboarding.
- Krafta Catalogs itself is currently the merchant/client of Krafta Pay in MVP.
- Future state: additional startups/products can become Krafta Pay merchants and use the same billing infrastructure with BYO acquirer accounts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KRAFTA MONOREPO                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                            APPS                                      │   │
│  │                                                                      │   │
│  │   ┌──────────────────────┐      ┌──────────────────────┐           │   │
│  │   │       krafta         │      │     krafta-pay       │           │   │
│  │   │   (Main Storefront)  │      │  (Payment Gateway)   │           │   │
│  │   │                      │      │                      │           │   │
│  │   │  • Catalog pages     │      │  • Checkout UI       │           │   │
│  │   │  • Dashboard         │      │  • Payment forms     │           │   │
│  │   │  • Search API        │      │  • Provider webhooks │           │   │
│  │   │  • Preview mode      │      │  • Auth flows        │           │   │
│  │   └──────────┬───────────┘      └──────────┬───────────┘           │   │
│  │              │                              │                       │   │
│  └──────────────┼──────────────────────────────┼───────────────────────┘   │
│                 │                              │                            │
│  ┌──────────────┼──────────────────────────────┼───────────────────────┐   │
│  │              ▼                              ▼                        │   │
│  │                           PACKAGES                                   │   │
│  │                                                                      │   │
│  │   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │   │
│  │   │  payments-core   │ │     supabase     │ │      theme       │   │   │
│  │   │                  │ │                  │ │                  │   │   │
│  │   │ • Checkout logic │ │ • DB types       │ │ • ThemeProvider  │   │   │
│  │   │ • Provider SDK   │ │ • Server client  │ │ • Global styles  │   │   │
│  │   │ • Webhooks       │ │ • Browser client │ │ • Font config    │   │   │
│  │   └──────────────────┘ └──────────────────┘ └──────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                            SUPABASE                                   │   │
│  │                                                                       │   │
│  │   PostgreSQL │ Auth │ Storage │ Edge Functions │ Realtime            │   │
│  │                                                                       │   │
│  │   Schemas: public (catalogs) │ payments (transactions)               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 24.5.0 |
| **Framework** | Next.js 16.1.2 (App Router, Cache Components) |
| **React** | React 19.2.3 |
| **Language** | TypeScript 5.9.3 |
| **Package Manager** | pnpm (workspaces) |
| **Styling** | Tailwind CSS 4.1.18, CSS Variables |
| **Components** | shadcn/ui (New York style), Radix UI primitives |
| **Animation** | Framer Motion 12.x |
| **Database** | Supabase (PostgreSQL 13.0.5) |
| **Auth** | Supabase Auth (@supabase/ssr) |
| **Payments** | Custom multi-provider (Payme, Click, Uzum) |
| **AI** | Vercel AI SDK 6.x |
| **Search** | Hybrid (FTS + trigram + vector embeddings) |
| **Charts** | Recharts 3.x |
| **Forms** | React Hook Form + Zod 4.x |
| **Analytics** | Vercel Analytics + Speed Insights |
| **Fonts** | Geist Sans, custom Krafta brand font |

---

## Project Structure

```
krafta/
├── apps/
│   ├── krafta/                    # Main storefront & catalog app
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout with providers
│   │   │   ├── page.tsx           # Landing page
│   │   │   ├── globals.css        # Tailwind + CSS variables
│   │   │   ├── fonts.ts           # Font configuration
│   │   │   ├── [...slug]/         # Dynamic catalog routes
│   │   │   │   ├── page.tsx       # Catalog page (SSR + caching)
│   │   │   │   ├── layout.tsx     # Catalog layout
│   │   │   │   └── loading.tsx    # Loading skeleton
│   │   │   ├── api/
│   │   │   │   ├── catalogs/      # Catalog API endpoints
│   │   │   │   ├── items/         # Item API endpoints
│   │   │   │   └── search/        # Hybrid search API
│   │   │   ├── dashboard/         # Merchant admin
│   │   │   │   ├── [orgSlug]/     # Org-scoped dashboard
│   │   │   │   │   └── [catalogSlug]/  # Catalog editor
│   │   │   └── preview/           # Live preview mode
│   │   ├── components/
│   │   │   ├── ui/                # shadcn/ui components (30+)
│   │   │   ├── catalogs/          # Catalog-specific components
│   │   │   │   ├── cards/         # Item card variants (5)
│   │   │   │   ├── headers/       # Header variants (3)
│   │   │   │   ├── sections/      # Section variants (3)
│   │   │   │   ├── navbars/       # Category nav variants (4)
│   │   │   │   ├── items/         # Item detail views (2)
│   │   │   │   └── search/        # Search components
│   │   │   ├── dashboard/         # Dashboard components
│   │   │   ├── ai-elements/       # AI UI components (30)
│   │   │   ├── brand/             # Brand assets
│   │   │   └── krafta/            # Core Krafta components
│   │   ├── lib/
│   │   │   ├── utils.ts           # Utility functions (cn, etc.)
│   │   │   ├── haptics-client.ts  # Tactile feedback (tactus)
│   │   │   ├── catalogs/
│   │   │   │   ├── data.ts        # Data fetching (cached)
│   │   │   │   ├── types.ts       # Catalog types
│   │   │   │   ├── layout.tsx     # Layout renderer
│   │   │   │   ├── layout-registry.tsx  # Component registry
│   │   │   │   ├── media.ts       # Media URL helpers
│   │   │   │   ├── pricing.ts     # Price formatting
│   │   │   │   ├── revalidate.ts  # Cache invalidation
│   │   │   │   └── settings/      # Layout & currency settings
│   │   │   ├── dashboard/         # Dashboard utilities
│   │   │   └── supabase/
│   │   │       ├── client.ts      # Browser client
│   │   │       ├── server.ts      # Server client (cookies)
│   │   │       └── types.ts       # Generated DB types
│   │   ├── public/
│   │   │   └── fonts/             # Custom fonts (.woff2)
│   │   ├── components.json        # shadcn/ui config
│   │   ├── next.config.ts         # Next.js config
│   │   ├── tsconfig.json          # TypeScript config
│   │   └── package.json
│   │
│   └── krafta-pay/                # Payment infrastructure app
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── (auth)/            # Auth routes (login, etc.)
│       │   ├── actions/           # Server actions
│       │   ├── api/               # Webhook endpoints
│       │   ├── dashboard/         # Merchant payment dashboard
│       │   └── pay/
│       │       └── [public_token]/ # Checkout page
│       ├── components/
│       ├── lib/
│       └── package.json
│
├── packages/
│   ├── payments-core/             # Payment processing logic
│   │   └── src/
│   │       ├── index.ts           # Public exports
│   │       ├── types.ts           # Type definitions
│   │       ├── checkout.ts        # Session creation logic
│   │       ├── db.ts              # Database helpers
│   │       ├── webhook.ts         # Webhook processing
│   │       └── providers/
│   │           ├── index.ts       # Provider registry
│   │           ├── payme.ts       # Payme integration
│   │           ├── click.ts       # Click integration
│   │           └── uzum.ts        # Uzum Bank integration
│   │
│   ├── supabase/                  # Shared Supabase client
│   │   └── src/
│   │       ├── client.ts          # Browser client factory
│   │       ├── server.ts          # Server client factory
│   │       └── database.types.ts  # Generated types (1500+ lines)
│   │
│   └── theme/                     # Shared theme package
│       └── src/
│           ├── fonts.ts           # Font exports
│           ├── styles.css         # Base styles
│           └── ThemeProvider.tsx  # next-themes wrapper
│
├── supabase/                      # Supabase project config
│   └── .temp/                     # Local dev files
│
├── docs/
│   └── search.md                  # Search architecture docs
│
├── package.json                   # Root workspace config
├── pnpm-workspace.yaml            # pnpm workspace definition
└── pnpm-lock.yaml
```

---

## Apps

### `krafta` (Main App)

The primary storefront and catalog application.

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/[...slug]` | Dynamic catalog routes (`/shop`, `/shop/drinks`, `/shop/drinks/cola`) |
| `/dashboard` | Merchant admin (redirects to org/catalog) |
| `/dashboard/[orgSlug]/[catalogSlug]` | Catalog editor |
| `/preview/[...slug]` | Preview mode for unpublished changes |
| `/api/search` | Hybrid search endpoint |
| `/api/catalogs/*` | Catalog management API |
| `/api/items/*` | Item management API |

### `krafta-pay` (Payment Gateway)

Standalone payment infrastructure application.

| Route | Description |
|-------|-------------|
| `/` | Krafta Pay landing |
| `/login` | Merchant authentication |
| `/dashboard` | Payment analytics & management |
| `/pay/[public_token]` | Checkout page (customer-facing) |
| `/api/*` | Webhook endpoints for providers |

---

## Packages

### `@krafta/payments-core`

Core payment processing logic, provider-agnostic.

```typescript
// Key exports
export type { CreateCheckoutSessionInput, CreateCheckoutSessionResult };
export type { SelectProviderInput, SelectProviderResult };
export type { HandleWebhookInput, HandleWebhookResult };

export { createCheckoutSession };  // Create payment session
export { selectProvider };         // Choose payment method
export { handleWebhookEvent };     // Process provider webhooks
```

**Supported Providers:**
- **Payme** — Local payment aggregator
- **Click** — Local payment aggregator  
- **Uzum Bank** — Direct bank integration (WEB_VIEW, IFRAME, REDIRECT)

### `@krafta/supabase`

Typed Supabase client factories.

```typescript
// Server-side (with cookies)
import { createClient } from "@krafta/supabase/server";
const supabase = await createClient();

// Client-side (browser)
import { createClient } from "@krafta/supabase/client";
const supabase = createClient();
```

### `@krafta/theme`

Shared styling and theming.

```typescript
import { ThemeProvider } from "@krafta/theme";
import "@krafta/theme/styles.css";
```

---

## Database Schema

Two primary schemas in PostgreSQL:

### `public` Schema (Catalogs)

| Table | Description |
|-------|-------------|
| `catalogs` | Catalog definitions (slug, name, settings, org_id) |
| `catalog_categories` | Categories within catalogs |
| `catalog_locales` | i18n configuration per catalog |
| `catalog_category_translations` | Localized category content |
| `items` | Products/services |
| `item_translations` | Localized item content |
| `item_media` | Item images/media |

### `payments` Schema (Transactions)

| Table | Description |
|-------|-------------|
| `api_keys` | Merchant API keys (hashed) |
| `customers` | Customer records |
| `payment_intents` | Payment requests |
| `checkout_sessions` | Checkout state (public_token) |
| `payment_attempts` | Provider-specific attempts |
| `payment_events` | Raw webhook events |
| `org_provider_configs` | Provider credentials per org |

---

## API Reference

### Search API

**POST** `/api/search`

```typescript
// Request
{
  query: string;          // Search query
  catalogId?: string;     // Filter by catalog
  orgId?: string;         // Filter by organization
  limit?: number;         // Max results (1-50, default: 20)
}

// Response
[
  {
    id: string;
    name: string;
    description: string;
    type: "item" | "category";
    score: number;
    // ...additional fields
  }
]
```

**Search Strategy:** Automatic hybrid search combining:
1. Full-text search (PostgreSQL tsvector)
2. Trigram similarity (pg_trgm)
3. Vector embeddings (halfvec via `embed_query` edge function)

---

## Environment Variables

### Required (krafta)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Search (server-side only)
KRAFTA_SUPABASE_URL=https://xxx.supabase.co
KRAFTA_SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Billing orchestration
KRAFTA_PAY_URL=https://pay.krafta.org
PAY_BASE_URL=https://pay.krafta.org
KRAFTA_PAY_API_KEY=krp_test_xxxxxxxxxxxxxxxxx
KRAFTA_PAY_INTERNAL_SECRET=shared-secret-with-krafta-pay

# Optional for multi-domain auth redirect allowlist (comma-separated, no spaces)
# Example: https://pay.krafta.uz,https://pay.krafta.org
KRAFTA_ALLOWED_REDIRECT_ORIGINS=
KRAFTA_PAY_URLS=
PAY_BASE_URLS=
```

### Required (krafta-pay)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PAY_BASE_URL=https://pay.krafta.org
PAY_ENV=live
KRAFTA_PAY_INTERNAL_SECRET=your-shared-hmac-secret
KRAFTA_PAY_API_KEYS_SECRET=your-api-key-hash-secret
PAY_CREDENTIALS_SECRET=your-encryption-secret

# Optional app-login origin overrides (for multi-domain deployments)
KRAFTA_APP_URL=https://krafta.org
KRAFTA_APP_URLS=
NEXT_PUBLIC_KRAFTA_APP_URL=https://krafta.org
NEXT_PUBLIC_KRAFTA_APP_URLS=

# Provider credentials (per-org in DB)
# Configured in payments.org_provider_accounts + payments.org_provider_account_secrets
```

### Supabase Auth URL Configuration

In your Supabase project Authentication settings:

- Site URL: base app URL (for example `https://krafta.org`, not `/auth/confirm`)
- Redirect URLs must include:
  - `https://krafta.org/auth/confirm`
  - `https://pay.krafta.uz/auth/confirm` (or your Pay domain)
  - local dev callbacks if needed:
    - `http://localhost:3000/auth/confirm`
    - `http://localhost:3001/auth/confirm`

---

## Getting Started

### Prerequisites

- **Node.js** 24.5.0 (see `.nvmrc` or `engines` in package.json)
- **pnpm** 8+ (install: `npm install -g pnpm`)
- **Supabase CLI** (optional, for local dev)

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/krafta.git
cd krafta

# Install dependencies
pnpm install

# Copy environment files
cp apps/krafta/.env.example apps/krafta/.env.local
cp apps/krafta-pay/.env.example apps/krafta-pay/.env.local

# Start development
pnpm dev
```

### URLs

- **krafta**: http://localhost:3000
- **krafta-pay**: http://localhost:3001

---

## Scripts

### Root Workspace

```bash
pnpm dev              # Run all apps in parallel
pnpm dev:krafta       # Run krafta only
pnpm dev:krafta-pay   # Run krafta-pay only
pnpm build            # Build all packages and apps
pnpm build:krafta     # Build krafta only
pnpm start:krafta     # Start krafta production
pnpm lint             # Lint all packages
```

### Per-App

```bash
pnpm --filter krafta dev      # Dev server
pnpm --filter krafta build    # Production build
pnpm --filter krafta start    # Production server
pnpm --filter krafta lint     # ESLint
```

---

## Component System

### UI Components (`components/ui/`)

30+ shadcn/ui components with New York styling:

```
alert, aspect-ratio, badge, button, button-group, card, carousel, 
checkbox, collapsible, command, dialog, drawer, dropdown-menu, 
field, hover-card, input, input-group, label, navigation-menu, 
popover, progress, scroll-area, select, separator, skeleton, 
sonner, spinner, table, tabs, textarea, tooltip
```

### AI Elements (`components/ai-elements/`)

30 specialized AI UI components:

```
artifact, canvas, chain-of-thought, checkpoint, code-block, 
confirmation, connection, context, controls, conversation, edge, 
image, inline-citation, loader, message, model-selector, node, 
open-in-chat, panel, plan, prompt-input, queue, reasoning, shimmer, 
sources, suggestion, task, tool, toolbar, web-preview
```

---

## Catalog Layout System

Krafta uses a **registry-based layout system** for maximum customization.

### Layout Settings

```typescript
type CatalogLayoutSettings = {
  headerVariant: "header-basic" | "header-center" | "header-hero";
  sectionVariant: "section-basic" | "section-separated" | "section-pill-tabs";
  itemCardVariant: "card-big-photo" | "card-minimal" | "card-photo-row" | "card-default" | "card-glass-blur";
  categoryNavVariant: "nav-tabs" | "nav-tabs-motion" | "nav-tabs-dashboard" | "nav-none";
  itemDetailVariant: "item-sheet" | "item-fullscreen";
  itemCard: {
    columns: 1 | 2 | 3 | 4;
    aspectRatio: number;  // e.g., 4/3, 1, 16/9
  };
};
```

### Component Registry

```typescript
// lib/catalogs/layout-registry.tsx
const headerRegistry = {
  "header-basic": CatalogHeader,
  "header-center": CatalogHeaderCenter,
  "header-hero": CatalogHeaderHero,
};

const itemCardRegistry = {
  "card-big-photo": BigPhotoCard,
  "card-minimal": MinimalCard,
  "card-photo-row": PhotoRowCard,
  "card-default": CatalogItemCard,
  "card-glass-blur": GlassBlurCard,
};

// ... sections, navbars, item details
```

### Usage

```tsx
// Catalog settings stored in DB, resolved at render time
<CatalogLayout
  catalog={catalog}
  categoriesWithItems={categoriesWithItems}
  activeCategorySlug="drinks"
  activeItemSlug="cola"
  baseHref="/shop"
/>
```

---

## Payment System

### Checkout Flow

```
1. Merchant creates checkout session
   POST /api/checkout → createCheckoutSession()
   
2. Customer redirected to pay page
   /pay/{public_token}
   
3. Customer selects provider (Payme, Click, Uzum)
   selectProvider() → redirectUrl
   
4. Provider processes payment
   
5. Webhook received
   POST /api/webhooks/{provider} → handleWebhookEvent()
   
6. Customer redirected to success/cancel URL
```

### Creating a Checkout Session

```typescript
import { createCheckoutSession } from "@krafta/payments-core";

const result = await createCheckoutSession(supabase, {
  orgId: "org_xxx",
  amountMinor: 100000,  // 1000.00 UZS
  currency: "UZS",
  description: "Order #123",
  successUrl: "https://shop.example.com/success",
  cancelUrl: "https://shop.example.com/cancel",
  customer: {
    phone: "+998901234567",
  },
}, "https://pay.krafta.uz");

// result.payUrl → https://pay.krafta.uz/pay/{public_token}
```

---

## Search Architecture

Krafta implements intelligent hybrid search:

```
User Input → API /search → Edge Function embed_query (OpenAI)
                                ↓
                    Postgres RPC catalog_search_auto
                                ↓
              catalog_search_documents (fts + trgm + halfvec)
                                ↓
                           Results
                                ↓
                    log_search (analytics)
```

### Features

- **Short query handling**: Works with 1-3 character inputs
- **Intent understanding**: "попить" → water/drinks
- **Multi-language**: Russian, Uzbek, English
- **Auto-strategy**: SQL decides keyword vs hybrid
- **Logged for ML**: Query analytics for improvement

---

## Caching Strategy

### Next.js 16 Cache Components

```typescript
// next.config.ts
const nextConfig = {
  cacheComponents: true,  // Enable cache components
};
```

### Data Fetching with Cache Tags

```typescript
// lib/catalogs/data.ts
export async function getCatalogBySlug(slug: string) {
  "use cache";
  cacheTag(`catalog:${slug}`, "catalogs");
  
  // Fetch with cache tags
  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: { tags: [`catalog:${slug}`, "catalogs"] },
    cache: "force-cache",
  });
  // ...
}
```

### Cache Invalidation

```typescript
// lib/catalogs/revalidate.ts
export async function updateCatalogByIdAndSlug(params) {
  updateTag(`catalog:${params.catalogId}`);
  updateTag(`catalog-structure:${params.catalogId}`);
  updateTag("catalogs");
}

export async function revalidateCatalogById(catalogId: string) {
  revalidateTag(`catalog:${catalogId}`, "max");
}
```

---

## Platform Philosophy

| Principle | Description |
|-----------|-------------|
| **Ownership** | Businesses own their catalog, UX, and customer flow |
| **Local-first, global-ready** | Deep local payment & regulation integration, globally scalable |
| **Composable growth** | Catalog → Payments → Automation → AI → Scale |

---

## Roadmap

### Phase 1 — Storefronts & Monetization
Custom domains, themes, advanced checkout, promo codes, invoices, analytics

### Phase 2 — Telegram & Distribution
Telegram Mini Apps, native checkout, bot-based storefronts, chat-commerce

### Phase 3 — Marketplace Layer
Unified discovery, reviews, seller profiles, escrow payments, platform commissions

### Phase 4 — AI-First Commerce OS
Conversational storefronts, voice ordering, AI sales assistants, demand forecasting

### Phase 5 — Payments as a Product
Standalone APIs, white-label checkout, payment orchestration, subscription billing

---

## Vision

> Krafta aims to become the default commerce and payment infrastructure for small businesses in emerging markets.
>
> Not just a website builder. Not just a payment tool. A **full operating system for selling online.**

---

## License

Proprietary. All rights reserved.
