# Product Marketing Context — Krafta

*Last updated: 2026-06-30*
*Source: founder vision doc, DESIGN.md, live landing/onboarding copy (`apps/krafta/app/_components/landing/content.ts`), README. Sections marked **[confirm]** are inferred and need the founder's check.*

---

## Product Overview

**One-liner:** The operating system for local commerce. *(RU: «Операционная система для локальной торговли»)*

**What it does:** Krafta gives a local business its own digital storefront and order-taking system — menu/catalog, orders across dine-in / pickup / delivery, QR, translations, and (soon) payments — all run from a phone. It starts as a storefront and grows into a full commerce OS: payments, POS integrations, loyalty, customer data, and an AI seller.

**Product category (the "shelf"):** Commerce OS / own-storefront + ordering for local business. Customers don't search "commerce OS" — they search for *"QR-меню,"* *"приём заказов,"* *"свой сайт для кафе,"* *"онлайн-заказы без маркетплейса."* We sit between (a) marketplaces and (b) custom development.

**Product type:** Vertical SaaS commerce platform. Local-first (Uzbekistan / Central Asia), global-ready by architecture (multi-language, multi-provider payments, web + Telegram).

**Business model:** **Subscription, not commission.** Free to start (no card, no signup for a draft). Pro tier coming — *"a flat fee, never a percentage of your sales."* **Public launch: ~early July 2026 (this week).** Price not yet set — vision floats ~$20/mo, but the $5k/mo revenue goal argues for a higher band (see Goals + Open Decisions; pending competitor price points from `.agents/competitors.md`). Krafta Pay (cards, in person + online) is the next monetization layer and can carry revenue beyond the subscription.

---

## Target Audience

**Target businesses:** Cafes, restaurants, chaikhanas, local shops, showrooms, service businesses, and small/independent brands. Solo or small-team operators. Starting in **Tashkent and other Uzbek cities.**

**Decision-maker:** The **owner-operator** — usually the buyer, the champion, and a daily user all in one. Mobile-first, price-sensitive, multilingual (RU primary, UZ growing, EN for tourists). Often non-technical.

**Primary use case:** Stop running orders through chaos (Instagram/Telegram DMs, calls, notebooks, Excel) and get one branded system that takes every order, in one place, from a phone — without surrendering the customer or a cut of every sale to a marketplace.

**Jobs to be done:**
- "Give me my own digital storefront so I'm not a faceless card inside a marketplace."
- "Put every order — dine-in, pickup, delivery — on one screen so nothing slips through."
- "Let me go digital and start taking orders *today*, without a developer or a complex POS."

**Specific scenarios:**
- Restaurant/cafe: QR menu on the table → order to the kitchen (dine-in), plus pickup + delivery from the same menu.
- Shop / showroom: a shareable digital catalog customers can buy or order from.
- Service business: a clean list of services, packages, and options.
- Tourist-facing venue: a guest scans the QR and reads the catalog **in their own language — any language, not just RU/UZ/EN**. A wedge no local competitor matches.

---

## Personas

Krafta is mostly **single-stakeholder** (the owner does everything), but two adjacent roles matter:

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **Owner-operator** (buyer + champion) | More orders, less chaos, own brand, margin | Drowning in scattered DMs; no system; marketplace eats margin | "Каждый заказ — у вас." Your storefront, your brand, one screen, no commission. |
| **Staff** (waiter / cashier — user) | Taking orders fast without mistakes | Manual re-entry, missed orders | Orders land structured; nothing to re-type or lose. |
| **Guest** (the end customer — B2C side) | Easy ordering, in their language | App installs, language barriers, clunky chat ordering | Scan a QR or open Telegram — no app, own language, order in seconds. |

---

## Problems & Pain Points

**Core problem:** *"Local commerce still runs on chaos."* Orders arrive from Instagram, Telegram, calls, comments, notebooks, and Excel. One person takes the order in a chat, another writes it down, a third chases payment — and the owner can't see where orders come from, what sells, or where money leaks. *"The problem was never a missing website. It was a missing system."*

**Why current alternatives fall short:**
- **Marketplaces (Uzum, Ozon, Wildberries, Yandex):** give traffic but take the customer relationship *and* a cut of every sale; the business becomes a faceless, price-competing supplier.
- **Instagram / Telegram / WhatsApp selling:** no structured catalog, no clean checkout, manual payments, lost orders.
- **Shopify / global tools:** too complex, not localized, no local payment rails.
- **POS (iiko, Poster, Jowi):** complex, often half-set-up, not built for own-storefront ordering.
- **Custom development:** expensive, slow, and overkill for a small business.

**What it costs them:** Lost orders, wasted staff time, no visibility into sales, eroded margin paid to marketplaces, and no direct relationship with the customer they worked to win.

**Emotional tension:** The fear of orders slipping through the cracks; the frustration of being invisible inside a big platform; the feeling that "going digital properly" requires money and tech they don't have.

---

## Competitive Landscape

**Direct** *(own storefront / QR-ordering for local UZ businesses)* — full profiles in `.agents/competitors.md`:
- **robo.uz / Robosell** — broadest leader. Food **+ retail**, deep POS (iiko/R-Keeper/Poster) + delivery (Yandex/Fargo) integrations, real client logos. Flat **300k–900k UZS/mo (~$24–72)**. Feels like an admin-panel builder, not a brand.
- **lacafe.uz** — the one to watch. **VC-funded (Apr 2026), ~100 businesses.** Delivery-ops suite (own couriers + aggregator order intake from Wolt/Uzum Tezkor/Yandex Eats), native mobile apps. Flat **$100–300/mo per-branch**, restaurant-only, demo-led, no free tier.
- **qr-menu.uz = menuqr.uz** — cheap menu-display only (~$9.5–17/mo); looks abandoned. **restorica.uz** — view-only directory (no cart) — the faceless-card problem Krafta sells against.

> **Critical finding: every direct competitor is flat-subscription, ZERO commission** — robo.uz and lacafe *explicitly* defend "subscription, not a cut." So **"infrastructure, not commission" is parity here, not a wedge** (it's a wedge vs *marketplaces* — see Indirect). The real wedges vs these tools: **AI/conversational ordering (confirmed white space — none have it)**, free + no-signup entry, one-storefront-every-order, Telegram-native *storefront* (not just a bot), food **+** retail multi-vertical, Square/Vercel craft. **They lead us on:** published proof/customers, POS integration, and (lacafe) own-courier ops + funding.

**Secondary** *(different solution, same problem)*: selling via Instagram/Telegram DMs, Google Forms, generic website builders, standalone POS. Fall short on: no structured catalog, manual everything, no one screen for all orders.

**Indirect** *(conflicting approach)*: marketplaces — **Uzum Tezkor, Yandex Eats**, plus Uzum/Ozon/Wildberries for retail. **This is where "infrastructure, not commission" actually lands** — they take the customer *and* a cut of every sale. *"A marketplace takes your customer and a cut of every sale. Your storefront leaves you both."*

---

## Differentiation

**Key differentiators:**
- **Own storefront + brand ownership** — not a faceless card inside an aggregator.
- **No commission** — flat subscription. *"Infrastructure, not commission."* **Note:** direct competitors are *also* flat-sub, so this message wins against **marketplaces** (Uzum Tezkor, Yandex Eats), not against robo.uz/lacafe — aim it accordingly.
- **AI / conversational ordering (the moat)** — confirmed white space: no competitor has chat-to-order, an AI waiter, or smart search. This is the uncontested wedge vs every direct rival.
- **Telegram-native** — storefront as a Mini App and order alerts inside Telegram, where Uzbek merchants already work. Doesn't force a new habit.
- **One storefront for every order** — dine-in + pickup + delivery + browse-only from a single menu, instead of four disconnected tools.
- **Built for real menus** — variations, modifiers, required/default/extra options, notes, sizes. Closer to real restaurant/retail ops than a pretty catalog.
- **Menu translation into ANY world language** — not just RU/UZ/EN. A tourist from anywhere reads your menu in their own language; the merchant translates once (AI-assisted), no re-typing. *(Nuance: the storefront/dashboard UI ships in RU/UZ/EN; the menu **content** is unlimited — that's the part that matters for the tourist hook.)* This is a real wedge: competitors top out at RU/UZ.
- **Delivery built in** — zones, fees, and a Yandex courier called straight from the order.
- **Payments abstracted** — Payme / Click / Uzum now, Stripe later, via Krafta Pay — no API/webhook pain for the merchant.
- **Run it from your phone** — change the menu and take orders from anywhere.
- **Fast time-to-value** — *"Taking orders by tonight."* Snap-your-menu AI extraction, 3 steps, draft ready with no signup.
- **Krafta Studio** — AI builds a real, coded shop on Krafta's engine ("v0/Lovable for commerce"). **[confirm how prominently to market this vs. keep it behind the core product]**

**Why customers choose us:** Square-quality craft and a system that *respects how Tashkent businesses actually work* — local languages, local payments, Telegram, cash-first — at a price that's a flat fee, not a tax on every sale.

### Positioning architecture (recommended — founder to confirm)

Two layers, in this order. Do **not** collapse them.

- **Layer 1 — the acquisition hook (sell TODAY, present pain):** depends on where the prospect comes *from*:
  - *Coming from a marketplace / chat chaos* → *"Your own storefront. Every order, yours. No commission."* (the no-commission line lands hard here.)
  - *Comparing you to robo.uz / a QR-menu tool* → *"Free to start, taking orders by tonight, one system for every order — plus an AI seller they don't have."* (no-commission is parity vs these, so don't lean on it; lean on free + speed + AI.)
  The current homepage H1 *"One menu. Every order, yours."* already nails the universal version; keep it.
- **Layer 2 — the moat & vision (differentiate + excite):** *conversational commerce / AI seller.* **Competitor recon confirms this is uncontested white space** — none of the 5 rivals have it. This is the *"why Krafta over robo.uz / lacafe.uz"* wedge, the investor story, and the long-term defensibility. Market it as *"and Krafta is becoming an AI seller,"* not as the lead headline.

**Why not lead with AI / "future of commerce" / "power for your business":** (1) The AI assistant is still "Soon" (unshipped) — leading on it creates a credibility gap. (2) The buyer feels operational pain today, not a craving for the future. (3) "Power for your business" and "future of commerce" are vague — they fail the specific-over-vague test and could describe any SaaS. *"Future of commerce" is a fine aspirational brand line / vision-doc title; it is not a converting homepage headline.* **Lead with the present pain, differentiate with the future.**

---

## Objections

| Objection | Response |
|-----------|----------|
| "I already use Instagram / Telegram — why change?" | Krafta runs *inside* Telegram and structures the chaos you already live in. You don't drop your channel; you stop losing orders in it. |
| "Is this expensive? Another subscription?" | Free to start, no card. When you upgrade it's a flat fee — never a percentage of your sales, unlike a marketplace. |
| "Setup looks like a lot of work." | Snap a photo of your menu and we build the catalog in seconds. Three steps, a draft with no signup, taking orders by tonight. |
| "Can my customers pay by card?" | Cash in person today; card payments via Krafta Pay (in person + online) are coming — flat fee, not commission. |
| "Will my customers actually use it?" | No app to install — they order from a link or in Telegram, in their own language. |

**Anti-persona:** Large enterprise chains needing deep ERP/inventory; businesses fully content being commodity suppliers inside a marketplace; purely offline businesses with no intent to take digital orders. *(Don't burn acquisition effort here.)*

---

## Switching Dynamics (JTBD Four Forces)

**Push (away from today):** Lost orders, chaos across chats/notebooks, no visibility, marketplaces eating margin and owning the customer.

**Pull (toward Krafta):** Own branded storefront, every order on one screen, no commission, Telegram-native, multilingual, *"taking orders by tonight."*

**Habit (keeps them stuck):** Comfort of Instagram/Telegram DMs and the notebook; an existing half-used POS; "it kind of works."

**Anxiety (worries about switching):** "Will my customers adopt a new ordering flow?" · "Is another tool/subscription worth it?" · "Is setup and the learning curve too much?" · "Is my menu/data safe?"
*→ Marketing must defuse all four: free + no signup (lowers cost anxiety), snap-your-menu (lowers effort anxiety), Telegram-native + no app for guests (lowers adoption anxiety).*

---

## Customer Language

**How they describe the problem (verbatim, RU):**
- «Локальная торговля всё ещё держится на хаосе»
- «Переписки, звонки, блокнот, потерянные заказы»
- «Дело не в отсутствии сайта. Дело в отсутствии системы.»

**How we describe the solution (verbatim, RU / EN):**
- «Одно меню. Каждый заказ — у вас.» / "One menu. Every order, yours."
- «Инфраструктура, а не комиссия.» / "Infrastructure, not commission."
- «Не маркетплейс. Ваша витрина — со своим брендом и своим именем.»
- «К вечеру вы уже принимаете заказы.» / "Taking orders by tonight."
- "Krafta starts as a storefront. Then becomes commerce OS."

**Words to use:** витрина (storefront), система (system), заказы, QR, инфраструктура, свой бренд / своё имя, с телефона, без регистрации, зал / самовывоз / доставка.

**Words to avoid:** маркетплейс *(as a self-label)*, комиссия / процент *(as our model)*, "просто сайт" *(we're a system, not a website)*, generic SaaS/enterprise jargon, anything translated-sounding rather than native RU.

**Glossary:**
| Term | Meaning |
|------|---------|
| Витрина / Storefront | The business's own public catalog — the first layer of Krafta |
| Commerce OS | The long-term product: storefront + orders + payments + POS + loyalty + AI |
| Модификаторы / Variations | Real-menu options (toppings, sizes, required/default choices) |
| Зал / Pickup / Доставка | Dine-in / pickup / delivery order modes |
| Krafta Pay | The payments layer (Payme/Click/Uzum now, Stripe later) |
| Krafta Studio | AI that builds a real coded shop on Krafta's engine |
| TMA | Telegram Mini App — the storefront running inside Telegram |

---

## Brand Voice

**Tone:** Confident, calm, direct, outcome-led. *"One Tashkent operator talking to another."* RU-first and **native, never translated-sounding.**

**Style:** Short and concrete. No fluff, no hype, no SaaS template-speak. Says the outcome ("taking orders by tonight"), not the feature list. Withholding and minimal — looks expensive because it restrains, not because it adds. *(Visual counterpart in DESIGN.md: no purple gradients, no icon-in-circle feature grids, Geist + Helvetica Neue wordmark.)*

**Personality (3–5 adjectives):** Grounded · Confident · Practical · Modern · Locally-fluent (with a world-class craft bar: Square / Stripe / Vercel).

---

## Proof Points

**Live capabilities (use as proof today):** cash orders, Yandex courier dispatch, order alerts in Telegram, RU/UZ/EN storefront, dine-in/pickup/delivery from one menu, snap-your-menu AI extraction.

**Quality anchors:** built to a Square (POS), Stripe (payments primitives), Vercel (craft) bar.

**Metrics / customers / testimonials:** **[OPEN — pre-launch.]** No public customer logos, GMV, or order-volume numbers to cite yet. **This is the highest-priority gap for acquisition** — the first 3–5 named merchants + a "we processed N orders / saved X hours" stat will unlock case studies, social proof on the landing page, and sales collateral. Capture these from the very first onboarded shops.

| Value theme | Proof |
|-------------|-------|
| Own your customer & brand | "Not a marketplace. Your storefront — your own brand, your own name." |
| No commission | "Infrastructure, not commission. We don't take a cut of every sale." |
| Fast to live | "Taking orders by tonight" — 3 steps, snap-your-menu, no signup |
| One system, not ten apps | "One system instead of ten apps" |

---

## Goals

**North-star goal:** **$5,000/mo recurring revenue.** What that takes depends entirely on price (subscription only, before Krafta Pay):

| Price/mo | Paying merchants for $5k MRR |
|---|---|
| $20 | **250** |
| $29 | 173 |
| $39 | 128 |
| $49 | **102** |

**Reality check:** for a product launching this week, $5k MRR is a **~6–12-month North Star, not a 30-day target.** Acquiring 100–250 paying SMBs takes time. Two levers shorten it: (a) **price higher than $20** (fewer merchants needed — argues for a $29–49 band, validated via `/pricing` + competitor data), and (b) **Krafta Pay** payment revenue layered on top once cards ship.

**90-day leading-indicator target (proposed — confirm):** ~40 shops onboarded · ~20 actively taking real orders · first ~10 paying. Prove the loop before chasing the revenue number.

**Key conversion action:** **"Create your shop"** (free, no signup) → **activate** (build menu, share link / connect Telegram, take first order) → **upgrade** (Pro / Krafta Pay).

**Current metrics:** **[OPEN]** — signups, activation rate, first-order rate, and blended CAC are not yet established. CAC-unknown is the highest-impact open decision for any paid plan later.

---

## Open Decisions (status as of 2026-06-30)

1. **Pro price — RECOMMENDATION READY (founder to ratify).** Competitor anchors (`.agents/competitors.md`): robo.uz entry **$24/mo** (top $72), lacafe **$100+/mo** (different buyer), qr-menu **$9.5–17/mo**. Recommended **two tiers**: **Pro ~$20/mo** (just under robo.uz's $24; the free tier already beats everyone on friction) **+ Business ~$39–49/mo** (delivery zones + Krafta Pay + analytics + AI ordering) to capture robo.uz's $40–72 range — both rivals ladder features by tier, so this matches the market norm. Anchor on value, not the $9.5 floor (that frames Krafta as a menu tool). Use robo.uz's own *"50–62M sums for custom dev"* math against them. Deeper Van-Westendorp once there are customers to survey.
2. **Competitors — RESOLVED + PROFILED.** Full brief in `.agents/competitors.md` (pricing, features, 5 "vs/alternative" page angles).
3. **First-merchant proof — STILL OPEN (biggest acquisition gap).** Competitors set the bar: **lacafe publishes ~100 businesses + 30%/20%/2× stats; robo.uz shows client logos.** Krafta has zero. **Action:** instrument the very first onboarded shops for a hard number (orders processed, hours saved, % more orders) + one quotable testimonial. Until this exists, the landing page and pitch run on claims, not proof.
4. **Core positioning — DECIDED (recommended, founder confirming).** Two-layer: storefront/no-commission **hook** for acquisition + conversational-commerce/AI-seller as the **moat & differentiator** (the wedge vs commodity QR-menu competitors). See "Positioning architecture." Founder's instinct toward conversational commerce is right — as the *differentiator*, not the *lead headline*.
5. **Target — SET.** $5k/mo MRR North Star (~6–12 mo); 90-day leading indicators: ~40 onboarded / ~20 taking orders / ~10 paying.
