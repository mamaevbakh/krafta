# Krafta FAQ

This document contains two sections:
- **Customer FAQ**: for people using Krafta to build a catalog/storefront and manage billing.
- **Krafta Pay API Integration FAQ (for client apps)**: for developers integrating their product with Krafta Pay APIs and hosted checkout/portal.

If you are a Krafta customer/end user, you only need the **Customer FAQ** section.

---

# Customer FAQ

## What Is Krafta?

Krafta helps small businesses sell with a clean online catalog and a simple upgrade path for billing and subscriptions.

You use Krafta to:
- Create your catalog (categories, items, prices, photos).
- Share a public link or QR for customers to browse.
- Manage your account, subscription, and billing status.

---

## What Is “Krafta Pay” and Why Do I See It?

Krafta Pay is Krafta’s hosted billing system.

You may see Krafta Pay when you:
- Upgrade your plan (checkout page).
- Manage billing (a secure customer portal page).

Krafta Pay exists so payments and subscription management stay consistent and secure, even as the Krafta product evolves.

---

## Getting Started

### How do I create a catalog?
Create a catalog in your dashboard, then add:
- categories (for example “Drinks”, “Services”)
- items (name, price, description, photos)

### How do I share my catalog with customers?
Share your public catalog link (or QR). Customers can open it on mobile and browse your categories and items.

### Can I customize the look of my catalog?
Yes. Krafta supports layout and style customization (for example headers, sections, item cards, and navigation).

---

## Plans, Billing, and Subscriptions

### How do I upgrade my plan?
In your Krafta dashboard, open Billing and choose a plan. You’ll be redirected to a secure checkout page to complete payment.

### Why did the payment screen show 0.00 UZS?
Some providers require a “card attachment” step before the first subscription charge. During that step, the provider UI can show `0.00 UZS`. This is expected.

After the card is attached successfully, the subscription charge is completed.

### What payment methods are supported?
Krafta Pay is built to support multiple providers. Availability depends on your market and the plan checkout you are using.

### My payment failed. What should I do?
Most payment failures are caused by:
- insufficient balance or card limits
- temporary bank/provider issues
- card attachment step not completing

Try again, or update your payment method in the billing portal if that option is available.

### How do I update my payment method?
Use the “Manage Billing” or “Update payment method” action from within Krafta. This opens a secure hosted billing portal.

### How do I cancel my subscription?
If self-serve cancellation is available in your billing portal, you can cancel there. Cancellation may be set to take effect at the end of the current billing period, depending on the plan rules.

### Where can I see invoices or receipts?
If invoices are available for your plan, you’ll see them in the billing portal under your subscription.

---

## Accounts and Access

### Do I need a separate Krafta Pay account?
No. Krafta Pay uses the same identity and account access you use in Krafta.

### Is checkout safe?
Checkout is hosted and handled through Krafta Pay to reduce fraud risk and keep sensitive payment steps in a controlled environment.

---

## Troubleshooting (User-Focused)

### I upgraded but still see “Free” or locked features
This can happen if:
- payment is still processing
- the subscription activation step is delayed

Wait a few minutes and refresh your Billing page. If it still doesn’t update, contact support with:
- your organization name
- the time you attempted checkout

### I was redirected back but I’m not sure if it worked
Open your Billing page. The subscription status is the source of truth.

---

## Support and Escalation

When contacting support, include:
- your organization name
- what you were trying to do (upgrade, update payment method, cancel)
- approximate time of the issue
- any screenshot of the error message (if available)

---

## Search Terms (For Support and AI Assistants)

If a user mentions any of these terms, it usually relates to billing/checkout:
- upgrade, plan, subscription, invoice, payment failed, manage billing, portal, 0.00 UZS

---

# Krafta Pay API Integration FAQ (For Client Apps)

This section is for developers integrating their product with Krafta Pay (similar to how the Krafta app integrates). It focuses on the public API surface and hosted URL behavior, not internal infrastructure.

## Glossary (Consistent Platform Terms)

- **Krafta**: merchant-facing product app.
- **Krafta Pay**: hosted billing infrastructure app (checkout, plans, subscriptions, portal, provider orchestration).
- **Platform merchant**: the product using Krafta Pay as billing infra (today: Krafta Catalogs).
- **Subscriber / end customer**: the org/user paying for that product’s plan.

## API Overview (`/api/v1`)

Auth:
```http
Authorization: Bearer krp_test_...   # or krp_live_...
```

### `GET /api/v1/plans`
Lists active plans for the authenticated platform merchant org. Typical use: pricing page / upgrade plan selector.

### `POST /api/v1/subscriptions/checkout`
Creates (or resumes) a subscription checkout and returns a hosted checkout URL (`payUrl`).

Typical request:
```json
{
  "customerOrgId": "uuid-of-subscriber-org",
  "planId": "uuid-of-plan",
  "successUrl": "https://merchant.app/billing?checkout=success",
  "cancelUrl": "https://merchant.app/billing?checkout=cancel",
  "returnUrl": "https://merchant.app/billing?checkout=success",
  "customerRef": {
    "email": "owner@example.com",
    "customerUserRef": "user_123"
  }
}
```

Typical response fields:
- `payUrl`
- `publicToken`
- IDs: `subscriptionId`, `invoiceId`, `checkoutSessionId`, `paymentIntentId`

### `POST /api/v1/customer_portal/sessions`
Creates a hosted customer portal session URL (short-lived) for self-serve billing actions.

Supported `flowData.type` values:
- `payment_method_update`
- `subscription_cancel`
- `subscription_update`

## Hosted URL Integration Rules

- Open hosted checkout/portal as full-page navigations.
- Do not iframe embed.
- Production return URLs should be HTTPS (required for Uzum flows).

## Checkout and Subscription Flow (What Your App Should Expect)

High-level flow:
1. Your backend calls `POST /api/v1/subscriptions/checkout`.
2. Your frontend navigates to the returned `payUrl` (hosted checkout).
3. The user completes provider steps on the hosted page.
4. The user is redirected back to your `successUrl` / `cancelUrl` / `returnUrl`.
5. Your app displays the updated subscription/billing state (your source of truth).

Important UX note for your product:
- Some providers may show `0.00 UZS` during a required card-attachment step before the first subscription charge. This is expected and should be explained in your UI copy.

## URL and Redirect Requirements

- `successUrl`, `cancelUrl`, and `returnUrl` must be absolute URLs back to your app.
- In production, use HTTPS URLs.
- Treat the redirect-back as “navigation completed”, not proof of success. Always confirm subscription state from your own backend/business state.

## Portal Session Expectations

- Portal sessions are short-lived. Create a portal session when the user clicks “Manage Billing”, rather than generating links far in advance.
- Open the returned portal `url` as a full-page navigation.

## Where to Read More (Repo Docs)

- Krafta Pay platform reference (deep dive): `docs/krafta-pay-platform-reference.md`
- Krafta Pay app README: `apps/krafta-pay/README.md`
