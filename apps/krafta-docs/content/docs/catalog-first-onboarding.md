---
title: "Catalog-First Onboarding"
description: "Guest-first catalog creation flow with auth required only at publish."
order: 3
group: "Onboarding"
---

# Catalog-First Onboarding

The onboarding target flow is:

`Landing -> Create Catalog -> Preview -> Publish -> Authentication`

## Behavior

- Users can create and edit draft catalogs before authentication.
- Draft state is saved through onboarding session context.
- Authentication is required at publish/save boundary only.

## Publish Branches

### Case A: User is not logged in

1. Redirect to central auth.
2. Return to publish continuation route after successful auth.
3. Resolve or create organization.
4. Attach and publish catalog.

### Case B: User is already logged in

1. Use existing session.
2. If one organization exists, auto-attach.
3. If multiple organizations exist, request explicit selection.

## State Continuity

Use signed state payloads to preserve:

- draft/catalog id
- intended next route
- nonce and issue time
