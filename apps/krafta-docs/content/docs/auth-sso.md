---
title: "Auth and SSO"
description: "Central authentication strategy with auth.krafta.org for all first-party products."
order: 2
group: "Core"
---

# Auth and SSO

Krafta uses a central auth broker at `auth.krafta.org` for first-party web products.

## Goals

- One sign-in across `krafta.org` and `pay.krafta.org`.
- Long-lived central session with local app session re-establishment.
- Shared identity via Supabase Auth.

## Core Flow

1. Product redirects user to `/authorize`.
2. Auth app returns authorization code.
3. Product exchanges code at `/token`.
4. Product finalizes local session through `/auth/confirm`.

## Domain Strategy

This flow is domain-flexible by allowlisting callback and confirm URLs for each product domain:

- `.org`
- `.uz`
- `.company`

Add new product domains in SSO client redirect configuration and Supabase redirect allowlists.
