# Nextjs Stripe Package

Private Next.js-specific Stripe + Supabase billing integration.

## Install (GitHub)

SSH:
```
npm install git+ssh://git@github.com/MaggieZinger/Nextjs-Stripe.git
```

HTTPS with token:
```
npm install https://<TOKEN>@github.com/MaggieZinger/Nextjs-Stripe.git
```

## Required env vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_CONTENT_PACK=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=
```

## Usage

Billing page:

```tsx
import { BillingForm } from '@maggiezinger/nextjs-stripe/billing/client'
import {
    createPaymentIntent,
    createSubscription,
    getBillingPlansWithStripePricing,
    getBillingProfile
} from '@maggiezinger/nextjs-stripe/billing/server'

export default async function BillingPage() {
    const [plans, profileResult] = await Promise.all([
        getBillingPlansWithStripePricing(),
        getBillingProfile()
    ])

    return (
        <BillingForm
            plans={plans}
            profile={profileResult.profile ?? null}
            actions={{ createPaymentIntent, createSubscription }}
        />
    )
}
```

Webhook route:

```ts
export { POST } from '@maggiezinger/nextjs-stripe/webhook'
```

## Migration

Copy the migration from `supabase/migrations/20250601090000_add_stripe_fields_to_profiles.sql` into your app and run:

```
supabase db reset
```

## Build

```
npm run build
```
