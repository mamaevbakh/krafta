# Krafta — Go-to-Market Plan

*Last updated: 2026-07-09 · Owner: founder · Status: v1, consolidated from the marketing foundation*
*Reads with: [product-marketing.md](product-marketing.md) (positioning/ICP/voice) · [pricing-and-packaging.md](pricing-and-packaging.md) · [growth-plan-200.md](growth-plan-200.md) (funnel + sequence) · [outreach-tashkent.md](outreach-tashkent.md) (scripts) · [competitors.md](competitors.md) · [prospects-tashkent.md](prospects-tashkent.md) (the list)*

> This is the single plan of record. The docs above are the detail behind each section. Structured by AARRR (Acquisition → Activation → Retention → Referral → Revenue) so every move is funnel-stage-tagged and executable in priority order.

---

## 1. Executive summary

**What Krafta is:** the operating system for local commerce — a business's own storefront + order-taking system (menu, dine-in/pickup/delivery, QR, translation, soon payments), run from a phone. Vertical SaaS, local-first (Tashkent → Uzbekistan → Central Asia). **Subscription, not commission.**

**Three big bets for the next 12 months:**

1. **Win the first 100 merchants by hand, not by funnel.** Tashkent F&B buys on trust and demos. Founder-led white-glove onboarding (we build the menu from photos) converts ~40–50% vs. ~15–20% self-serve. This is the engine until the economics justify paid.
2. **Manufacture proof, because we have none and competitors have plenty.** lacafe publishes ~100 businesses + "30% more orders"; robo.uz shows client logos; Krafta shows claims. The founding-merchant offer exists to produce the first 3–5 named case studies with one hard number each. **This is the #1 acquisition unlock.**
3. **Build compounding distribution into the product, not the ad account.** "Powered by Krafta" on every storefront + a referral free-month + Telegram order-alert habit turn the product itself into the growth loop — the only affordable way to scale a bootstrapped SMB tool.

**90-day priority (the one thing):** prove the loop — *reach → white-glove onboard → first real order → paying → case study* — end to end, ~10–15 times. Everything else is secondary until this repeats.

**12-month outcome:** **~200 paying merchants ≈ $5,000 MRR** (blended ~$25). This is a 6–9 month build against a repeatable acquisition engine, layered with Krafta Pay revenue on top once cards ship. The unit economics support aggressive acquisition (see §8): ~88% gross margin, sub-3-month CAC payback at any realistic founder-led CAC — the binding constraint is **churn and activation, not spend.**

**What to ignore this quarter:** paid ads, SEO scale, and international. All are premature before proof and known CAC.

---

## 2. Strategic frame

**Category ("the shelf"):** Own-storefront + ordering for local business — sitting between marketplaces (take your customer + a cut) and custom dev (expensive, slow). Buyers don't search "commerce OS"; they search *«QR-меню», «приём заказов», «свой сайт для кафе», «онлайн-заказы без маркетплейса».* Meet them at that language.

**ICP:** The **owner-operator** of a Tashkent cafe / chaikhana / restaurant / local shop / made-to-order brand — buyer, champion, and daily user in one. Mobile-first, price-sensitive, multilingual (RU primary), often non-technical. Highest-value segment: **full-service, dine-in, multilingual venues with zero digitalization and no Telegram bot.**

**Business-model logic:** Flat subscription, no take-rate. Free is the acquisition engine (real storefront, tonight, no signup). Pro ($20) is the "real operations" line — unlocked the moment they want dine-in or delivery dispatch. Business ($39) is depth + scale, and the tier Krafta Pay + AI land in first. **Krafta Pay is the single biggest lever pulling the dine-in segment from $20 → $39+** once cards ship.

**Positioning (two layers — never collapse them):**
- **Layer 1, the acquisition hook (present pain, sell today):** *«Одно меню. Каждый заказ — у вас. Без комиссии.»* / "One menu. Every order, yours." Against marketplaces, lead the no-commission line; against robo.uz / QR-menu tools (who are *also* flat-sub), lead **free + speed + AI** instead — no-commission is parity there.
- **Layer 2, the moat (differentiate + excite):** **conversational commerce / AI seller** — confirmed white space; none of the 5 rivals have it. Market it as "*and* Krafta is becoming an AI seller," the investor story — not the lead headline (it's still "Soon").

**Brand voice non-negotiables:** Confident, calm, direct, outcome-led. *"One Tashkent operator talking to another."* **Native RU, never translated-sounding.** Says the outcome ("к вечеру принимаете заказы"), not the feature list. Withholding and minimal — looks expensive because it restrains. Visual counterpart is DESIGN.md (no purple gradients, no icon-in-circle feature grids).

---

## 3. Current state

**Phase of growth:** **True Day 0 — 0 merchants, 0 revenue** (confirmed 2026-07-09). The "grueling" pre-$10K-ARR phase in its earliest form: the only question that matters is whether the core loop (reach → onboard → first order → paying → case study) works *even once*. Until it does, unit economics are projections, not results — don't optimize them. Execution focus is the [Launch Week Sprint](launch-week-sprint.md).

**Team:** Founder-led, effectively solo on GTM. Strategy + execution both in-house today. This plan is **labor-led, not capital-led** — it runs on founder/SDR time, augmented by the marketing-skills library doing the work of a small team.

**Budget:** Bootstrapped / pre-funding. ~$0–2K/mo, essentially all tooling + founder time. No paid acquisition budget assumed.

**Unit economics (modeled — see the live calculator and §8):** Blended ARPU ~$25/mo; gross margin **~88%** (COGS ~$3/merchant: Supabase + Vercel + AI + support; **card processing = $0**, merchants BYO Atmos); contribution ~$22/merchant/mo; break-even at ~115 paying merchants against a $2.5K/mo fixed cost.

**What's shipped (proof-capable today):** live storefront (RU/UZ/EN), dine-in/pickup/delivery from one menu, cash orders, Yandex courier dispatch, Telegram order alerts, snap-your-menu AI extraction, delivery zones, iiko sync (in progress), Krafta Studio. **Pricing is live** (`/pricing`, Pro 250K / Business 490K UZS). SEO foundation live on krafta.uz (metadata, verified Google + Yandex).

**In-flight:** `/vs/*` + `/for/*` marketing pages (drafts, dev-only, pending review); Krafta Pay storefront card checkout (built, partial verification); AI ordering assistant (gated/phased). SSO + Telegram-login IdP live on prod.

**Current-state scores (scored from materials — push back where you have better data):**

| Area | Score /5 | Note |
|---|---|---|
| Positioning & messaging | 4 | Strong, two-layer, documented. Gap: unproven in market. |
| Pricing & packaging | 4 | Ratified, live, competitively anchored. Business price to revisit post-Pay. |
| Website / conversion | 3 | Landing + pricing solid; no social proof yet; vs/for pages undrafted-live. |
| Acquisition channels | 2 | Engine designed, not yet running at cadence. |
| Activation / onboarding | 3 | Snap-menu + white-glove strong; time-to-first-order not instrumented. |
| Retention / lifecycle | 2 | Telegram-alert habit exists; no weekly recap, no churn flow. |
| Referral | 1 | Designed (free-month + powered-by), not built. |
| Proof / social proof | 0 | **Zero.** The highest-impact gap. |
| Analytics / measurement | 1 | Funnel not instrumented; CAC/churn/activation all unknown. |

---

## 4. Acquisition — strangers → aware

**Motion:** warm Instagram/Telegram DM or in-person visit → free demo (we build it) → close → onboard. **No cold email, no Apollo, no Google Ads first** — wrong playbook for this market.

### Channels — ranked for Tashkent

**Tier 1 — now (launch → first 100):**
1. **Direct field + DM outreach (the engine).** Weekly cadence: **~50 DMs + 10–15 field visits/week** off the [prospect list](prospects-tashkent.md). Scripts are written per segment (A: cafe/DM-seller · B: made-to-order · C: just-opened · D: dine-in) in [outreach-tashkent.md](outreach-tashkent.md). Cluster field visits by street (Nukus st.: Teplo / Benedict / Materia — one walk, three pitches). *Skills: `prospecting`, `sales-enablement`, `cold-email` (adapted to Telegram DM).*
2. **Founding-merchant white-glove.** First ~20–30 shops onboarded by hand → instant proof + word-of-mouth. The offer *is* the hook (see §8).
3. **Referrals & word-of-mouth.** Tashkent F&B is tight — owners know owners. **Free month for every referred merchant who goes live**; ask every happy founder for 2 intros. Cheapest, highest-trust channel here. *Skill: `referrals`.*

**Tier 2 — once proof exists (month 2+):**
4. **"Powered by Krafta" loop.** Subtle *«Сделано на Krafta · Создать свою витрину»* on every storefront/QR. Their customers include other owners. **A code change, not a campaign** — compounding, free. *Build this early.*
5. **Instagram/Telegram content on real shops.** *«Собрали витрину кафе за вечер»*, before/after order chaos. Show, don't tell. Needs proof. *Skill: `social`.*
6. **Partnerships / co-marketing.** POS & equipment resellers, food bloggers, Telegram HoReCa/entrepreneur communities, food-court & market organizers, coworking spaces. One partner introduces dozens. *Skill: `co-marketing`.*

**Tier 3 — later / opportunistic:**
7. **Tourist angle** — hotels/hostels/tourist venues on multilingual QR menus (a wedge no local competitor pushes).
8. **Local launch + directories** — startup media, business chats, a launch moment. *Skills: `launch`, `directory-submissions`.*
9. **"vs" / SEO pages** — the angles in [competitors.md](competitors.md) (Krafta vs robo.uz, vs lacafe, category roundup). The `/vs/*` + `/for/*` drafts already exist — finish and ship them **once proof exists** to back the claims. Ranks in Google *and* arms sales. *Skills: `competitors`, `seo-audit`, `programmatic-seo`.*

> **Paid ads are deliberately last.** CAC is unknown, there's no proof, and the audience buys on trust + demo. Earn the first 100 by hand; the data decides if/when paid turns on. First paid experiment, post-round: IG/TG ads to lookalikes of *activated* merchants.

**90-day acquisition target:** ~3,000–4,000 touches → ~1,000 shops live is the *full-funnel-to-200* math; the 90-day slice is **~40 onboarded** (see §9 roadmap).

---

## 5. Activation — aware → first valued experience

**The activation metric is time-to-first-real-order.** A live shop that never takes an order churns; the one that takes an order in week 1 stays. This is the single best predictor of paying — obsess over it.

**The activation path:** *Create shop (free, no signup) → build menu (snap-menu AI or white-glove) → share link / connect Telegram → **take first real order** → upgrade.*

**Moves:**
- **White-glove for the first 100.** We build the menu from photos, translate RU/UZ/EN, deliver the live link + Telegram setup. Removes 100% of setup friction (the #1 anxiety). *Skill: `onboarding`.*
- **Instrument time-to-first-order and orders-processed** from shop #1. Today these are uninstrumented — this is the highest-impact analytics gap (§13). *Skill: `analytics`.*
- **Drive the first order deliberately** in onboarding: ask the merchant to share the link with a few regulars / put the QR on tables *today* (step 4 of the onboarding checklist in [outreach-tashkent.md](outreach-tashkent.md)).
- **Defuse the four switching anxieties** (JTBD): free + no-signup (cost), snap-menu (effort), Telegram-native + no-app-for-guests (adoption), "your data/brand stays yours" (safety).

**Target:** ~50% of onboarded shops take ≥1 real order; median time-to-first-order measured and driven down.

---

## 6. Retention — converted → stays & deepens

200 is a *net* number. At even 5%/mo logo churn you refill ~10 merchants/month; at 8% the LTV nearly halves (§8). **Acquisition cannot outrun a leaky product** — retention is the economic hinge of this plan.

**The retention spine:**
- **Time-to-first-order** (from §5) is also the retention root cause — protect it.
- **The Telegram order-alert habit is the retention hook.** Every order is a re-engagement ping inside the app the merchant already lives in. Protect and deepen it.
- **Weekly value recap** (Telegram): *«За неделю вы приняли N заказов на X сум».* Makes the subscription feel earned and keeps Krafta top-of-mind. *Skills: `emails`, `sms`.*
- **Churn-prevention before there's a churn problem** — save offers + dunning (esp. once Krafta Pay bills cards and involuntary churn appears). *Skill: `churn-prevention`.*

**Target:** monthly logo churn measured and held ≤5%; the weekly recap live by month 2.

---

## 7. Referral — retained → bring more

Referral is the highest-leverage, lowest-cost channel *for this market* — and it's currently a 1/5. Two mechanics, both product features, not campaigns:

- **Referral reward:** free month for every referred merchant who goes live. Ask at the moment of delight (first order / first case-study result). *Skill: `referrals`.*
- **"Powered by Krafta" loop** (also in §4): baked into every storefront the merchant already shares. This is the compounding, zero-CAC distribution engine.

**Target:** both loops shipped in the first 30 days (they're code, not content); referral attribution tracked from day one so we know which merchants drive intros.

---

## 8. Revenue — pricing, packaging, economics

**Model:** flat subscription, no commission. Ratified and live.

| | **Free** | **Pro** | **Business** |
|---|---|---|---|
| Price | 0 | **250,000 сум (~$20)/mo** | **490,000 сум (~$39)/mo** |
| For | IG/TG sellers, home bakers, tiny shops | Single-venue cafe/shop taking real orders | Multi-branch, dine-in, tourist-facing |
| Unlocks | storefront, QR, pickup/delivery-request, Telegram basic | + dine-in (QR→kitchen), delivery zones + Yandex courier, all orders one screen, basic analytics | + multi-venue, team roles, advanced analytics, priority support, **Krafta Pay & AI first** |

**Annual:** 2 months free (~17% off) — improves cash + retention.

**Founding-merchant offer (the launch wedge):** first ~20–30 shops get **free white-glove setup + Business features at the Pro price ($20), locked forever**, in exchange for feedback + a featured case study. Does three jobs at once: kills outreach friction, creates honest urgency, and **manufactures the proof we have zero of.**

**Unit economics (modeled; the four soft inputs are placeholders until real data lands — interactive model available):**

| Metric | Value (default assumptions) | Sensitivity |
|---|---|---|
| Blended ARPU | ~$25/mo (70% Pro / 30% Business) | — |
| Gross margin | **~88%** | card processing $0 (BYO Atmos) keeps it software-grade |
| Contribution / merchant | ~$22/mo | — |
| **LTV** | **~$437** at 5%/mo churn (20-mo life) | **→ ~$270 at 8%/mo.** Churn dominates everything. |
| CAC payback | **<3 mo** at $60 CAC | founder-led CAC is near-zero today (time, not cash) |
| LTV:CAC | ~7× | flatters because we're not spending yet; compresses when paid/sales turn on |
| Break-even | **~115 paying merchants** | at $2,500/mo fixed cost |

**What the economics tell the GTM:** margins and payback are healthy enough to acquire aggressively — **the constraint is churn and activation, not budget.** Spend the effort on time-to-first-order and retention, not on squeezing CAC.

**Revenue path to $5K MRR:** 200 paying at ~$25 blended. Two accelerants: (a) **Krafta Pay** adds a payment-revenue layer on top of subscriptions and pulls dine-in from Pro → Business; (b) **Business price raise** from $39 once Pay ships + case studies exist (fewer merchants needed per $1K MRR). *Skill: `pricing`.*

---

## 9. 90-day roadmap

Tagged by AARRR stage. Owner = founder unless a hire lands.

**Weeks 1–2 — Unblock & found.**
- [Acq] Start the outreach cadence: 50 DMs + 10 visits/week off the prospect list. *(A)*
- [Acq] Onboard **10–15 founding merchants** white-glove. *(A)*
- [Ref] Ship the two product loops: **referral reward + "powered by Krafta."** *(R)*
- [Act] Instrument **time-to-first-order + orders-processed** on every shop. *(A)*
→ *Exit: ~12 shops live, first orders flowing, proof-capture running.*

**Weeks 3–4 — Prove & systematize.**
- [Act] Drive first real orders; measure median time-to-first-order.
- [Acq] Publish the **first 2–3 case studies** (logo + quote + one hard number) the moment a founding merchant has results.
- [Ref] Start asking every happy merchant for 2 intros.
→ *Exit: ~35–45 live, **first ~10–15 paying**, 3 case studies.*

**Weeks 5–8 — Velocity (content + referrals compound).**
- [Acq] Content engine on real shops (before/after, "built in an evening"). *`social`.*
- [Acq] First partnership conversations (POS resellers, food bloggers, HoReCa communities).
- [Acq] Finish + ship the top 2 `/vs/*` pages now that proof backs them.
→ *Exit: ~80–100 live, ~40–60 paying.*

**Weeks 9–12 — Compound.**
- [Acq] Land 1–2 partnerships; test the tourist/multilingual angle with hotels/hostels.
- [Rev] Krafta Pay beta → begin moving dine-in Pro → Business.
- [Ret] Ship the weekly Telegram recap; set up churn-prevention before it's needed.
→ *Exit: ~120–140 live, ~70–90 paying.*

**Leading-indicator targets (90 days):** ~40 onboarded · ~20 activated (taking real orders) · **first ~10–15 paying** · 3 case studies. *Prove the loop before chasing the revenue number.*

---

## 10. 12-month outlook

Growth here is **linear + step-functions**, not a hockey stick: steady manual additions, punctuated by Krafta Pay (payment revenue + Business upsell) and the first channel that proves out (likely referrals or partnerships).

| Quarter | Milestone | Capability unlock |
|---|---|---|
| **Q1 (mo 1–3)** | Loop proven; ~70–90 paying; 3+ case studies | Manual engine running; product loops live |
| **Q2 (mo 4–6)** | ~120–150 paying; Krafta Pay GA; referrals compounding | Payment revenue layer; Business price raise; content + vs-pages ranking |
| **Q3 (mo 7–9)** | **~200 paying ≈ $5K MRR**; 1–2 partnerships live | Engine repeatable; if a round closes → first paid experiments to activated-merchant lookalikes |
| **Q4 (mo 10–12)** | Beyond $5K: expand segments (retail, tourist), deepen Pay ARPU, AI assistant GA as differentiator | Second S-curve (channel × product × market); possible first marketing hire (π-shaped: PMM + Growth) |

**Funding-stage note:** this plan assumes **bootstrapped** throughout. If a round closes: seed unlocks a ~$15K/mo paid test budget + a first hire — but only turn paid on **after CAC is known** from the organic engine. Don't pretend paid budget exists before the round.

---

## 11. Marketing operations stack

The differentiator of this plan: a solo founder + the marketing-skills library + MCP integrations outputs the work of a small marketing team. Mapping by stage:

| AARRR stage | Skills | Tooling / MCP |
|---|---|---|
| **Acquisition** | `prospecting`, `sales-enablement`, `cold-email` (→Telegram DM), `co-marketing`, `competitors`, `seo-audit`, `programmatic-seo`, `launch`, `directory-submissions`, `social` | Telegram, Instagram, krafta.uz SEO (metadata live), Vercel analytics/geo |
| **Activation** | `onboarding`, `analytics` | Snap-menu AI extraction, Next devtools, funnel instrumentation |
| **Retention** | `emails`, `sms`, `churn-prevention` | Telegram order-alert bot, weekly recap job |
| **Referral** | `referrals` | "Powered by Krafta" link (product), referral attribution |
| **Revenue** | `pricing` | Krafta Pay (Atmos), Stripe-style subscription billing (already wired both sides) |
| **Cross-cutting** | `copywriting`, `copy-editing`, `content-strategy`, `image`, `video`, `customer-research` | DESIGN.md, landing content.ts (RU/UZ/EN) |

---

## 12. Tactical idea bank (curated for Krafta)

Status: **Now** (this quarter) · **Q2** · **Q3+** · **Skip**. This is the client-specific curated set; a full numbered cross-reference against the 139-idea `marketing-ideas` library is a deferred enrichment pass (do it with the library open — don't fabricate idea numbers).

| Tactic | Stage | Status | Why |
|---|---|---|---|
| Founder-led white-glove onboarding | Acq/Act | **Now** | Converts 2–3× self-serve; the whole first-100 engine |
| Founding-merchant offer (Business@Pro, locked) | Acq/Rev | **Now** | Kills friction + manufactures proof |
| DM + field outreach cadence | Acq | **Now** | The engine; scripts ready |
| Referral free-month | Ref | **Now** | Cheapest high-trust channel here |
| "Powered by Krafta" loop | Ref/Acq | **Now** | Compounding zero-CAC distribution; it's code |
| Time-to-first-order instrumentation | Act | **Now** | Can't manage churn/activation blind |
| Case studies (logo + quote + 1 number) | Acq | **Now** | Closes the #1 gap; unlocks everything downstream |
| Weekly Telegram value recap | Ret | Q2 | Makes subscription feel earned |
| Content on real shops (before/after) | Acq | Q2 | Needs proof first |
| `/vs/*` + `/for/*` pages | Acq | Q2 | Drafts exist; ship once proof backs claims |
| Partnerships (POS resellers, bloggers, HoReCa) | Acq | Q2 | One partner = dozens of merchants |
| Churn-prevention (save offers, dunning) | Ret | Q2 | Before Krafta Pay adds involuntary churn |
| Tourist / multilingual QR angle | Acq | Q3+ | Real wedge; opportunistic |
| Local launch moment + directories | Acq | Q3+ | Awareness + backlinks |
| Krafta Studio as a marketed product | Acq | Q3+ | Confirm prominence vs. core product first |
| Paid ads (IG/TG lookalikes) | Acq | Q3+ | **Only after CAC known + round closed** |
| Cold email / Apollo / Google Ads-first | Acq | **Skip** | Wrong playbook for Tashkent SMB F&B |

---

## 13. Measurement, RACI, open decisions

**North-star metric:** paying merchants (→ $5K MRR). **Key conversion action:** create shop → activate (first real order) → upgrade.

**Leading indicators (weekly):**

| Metric | Why |
|---|---|
| Shops onboarded / week | Top-of-funnel velocity |
| **% activated (took a real order)** | Best predictor of paying — obsess over it |
| Free → paid % | Is packaging working? |
| Time-to-first-order (median) | Onboarding quality |
| Logo churn % | Is the bucket leaking? |
| MRR + blended price | Progress to $5K |
| CAC by channel (even rough) | When can paid turn on? |

**RACI (solo founder today):** founder is A+R on nearly everything; first hire (π-shaped PMM + Growth) takes execution off acquisition + content once a round funds it. Consultants/contractors for one-off execution (design, video) before any full-time growth hire.

**Open decisions (do not gloss — these gate the plan):**
1. **CAC — UNKNOWN.** Highest-impact open decision; every paid-channel decision waits on it. Establish from the organic engine before spending.
2. **Churn — UNKNOWN.** The LTV in §8 swings from ~$437 to ~$270 between 5% and 8%/mo. Instrument cohorts; this is the economic hinge.
3. **Activation rate & current merchant count — UNMEASURED.** Instrument from shop #1; the 90-day targets assume ~50% onboarded→activated.
4. **Launch status — CONFIRMED: 0 merchants, Day 0** (2026-07-09). The 90-day roadmap's Week 1 = now. Execution is the [Launch Week Sprint](launch-week-sprint.md).
5. **Business price raise timing** — start $39; raise once Krafta Pay ships + case studies exist.
6. **Krafta Studio marketing prominence** — market it now, or keep it behind the core product? Founder call.
7. **First hire trigger** — what MRR / what round milestone unlocks the π-shaped growth hire.

**Appendix — detail docs:** positioning/ICP/voice → [product-marketing.md](product-marketing.md) · tiers + founding offer → [pricing-and-packaging.md](pricing-and-packaging.md) · funnel math + sequence → [growth-plan-200.md](growth-plan-200.md) · DM/field scripts + one-pager + objections → [outreach-tashkent.md](outreach-tashkent.md) · competitor profiles + vs-page angles → [competitors.md](competitors.md) · the prospect list → [prospects-tashkent.md](prospects-tashkent.md).
