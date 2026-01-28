# Krafta

**The commerce and payment infrastructure for small businesses in emerging markets.**

Krafta is a modular SaaS platform that enables businesses to create digital catalogs, storefronts, and ordering flows, accept online payments, and interact with customers — without code, without complex integrations, and without external platforms.

Built for SMBs, creators, freelancers, restaurants, retail stores, and service providers — starting with Uzbekistan and Central Asia.

---

## Table of Contents

- [The Problem](#the-problem)
- [Core Features](#core-features)
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
```

### Required (krafta-pay)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Provider credentials (per-org in DB)
# Configured via org_provider_configs table
```

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
