# Phase 2B — Pass 2 Canonical Naming Map Applied

This pass applies the canonical naming map across the active billing flow.

## Canonical names

- `membershipTier` → entitlement level
- `lookupKey` → checkout target
- `subscriptionStatus` → billing lifecycle state
- `founderProtected` → founder pricing protection flag

## Updated active billing flow

### Billing status payload
Server and client billing status payloads now use:
- `membershipTier`
- `subscriptionStatus`
- `accessState`
- `founderProtected`

### Checkout session flow
Checkout creation now uses:
- `lookupKey` in the client request body
- `lookupKey` in the API handler
- `membershipTier` + `lookupKey` in scaffold responses

### UI consumption
Billing Settings now reads:
- `status.membershipTier`
- `status.subscriptionStatus`

## Intent of this pass

This reduces naming drift between:
- entitlement state
- checkout target identifiers
- subscription lifecycle state
- founder protection flags

It also lowers future Stripe hookup risk by avoiding overloaded field names like `planKey` and `billingStatus` in the primary billing status contract.
