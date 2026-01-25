# Nextjs Stripe Package

Private Next.js-specific Stripe + Supabase billing integration.

## Features

- ✅ One-time payments and recurring subscriptions
- ✅ **Dual payment flows**: Stripe Checkout (hosted) or custom embedded form
- ✅ Stripe webhook handling (automatic subscription updates)
- ✅ Feature flag management based on purchases
- ✅ Subscription cancellation with period end retention
- ✅ Subscription plan upgrades/downgrades with proration
- ✅ Customer Portal integration for payment management
- ✅ Subscription status display with colored badges
- ✅ Payment failure warnings with retry options
- ✅ Trial period support (display ready)

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

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=              # Required for webhook processing

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=                  # Get from: stripe listen or dashboard

# Stripe Price IDs (from your Stripe dashboard)
STRIPE_PRICE_CONTENT_PACK=              # One-time payment price ID
STRIPE_PRICE_PRO_MONTHLY=               # Monthly subscription price ID
STRIPE_PRICE_PRO_ANNUAL=                # Annual subscription price ID

# Payment Flow Options
STRIPE_USE_CHECKOUT=true                # Optional: Use Stripe Checkout (default: true)
                                        # Set to false for custom embedded form
```

## Usage

### 1. Billing Page

The package supports two payment flows:
- **Stripe Checkout** (default): Redirects to Stripe-hosted payment page
- **Custom Embedded Form**: Payment form embedded directly in your app

#### Option A: Stripe Checkout (Recommended - Default)

```tsx
import { BillingForm } from '@maggiezinger/nextjs-stripe/billing/client'
import {
    createCheckoutSession,
    cancelSubscription,
    createCustomerPortalSession,
    getBillingPlansWithStripePricing,
    getBillingProfile,
    updateSubscription
} from '@maggiezinger/nextjs-stripe/billing/server'
import { env } from '@maggiezinger/nextjs-stripe/env/server'

export default async function BillingPage() {
    const [plans, profileResult] = await Promise.all([
        getBillingPlansWithStripePricing(),
        getBillingProfile()
    ])

    return (
        <BillingForm
            plans={plans}
            profile={profileResult.profile ?? null}
            useCheckout={env.STRIPE_USE_CHECKOUT}
            actions={{
                createCheckoutSession,  // For Stripe Checkout
                updateSubscription,
                cancelSubscription,
                createCustomerPortalSession
            }}
        />
    )
}
```

#### Option B: Custom Embedded Form

Set `STRIPE_USE_CHECKOUT=false` in your environment, then:

```tsx
import { BillingForm } from '@maggiezinger/nextjs-stripe/billing/client'
import {
    createPaymentIntent,
    createSubscription,
    cancelSubscription,
    createCustomerPortalSession,
    getBillingPlansWithStripePricing,
    getBillingProfile,
    updateSubscription
} from '@maggiezinger/nextjs-stripe/billing/server'
import { env } from '@maggiezinger/nextjs-stripe/env/server'

export default async function BillingPage() {
    const [plans, profileResult] = await Promise.all([
        getBillingPlansWithStripePricing(),
        getBillingProfile()
    ])

    return (
        <BillingForm
            plans={plans}
            profile={profileResult.profile ?? null}
            useCheckout={env.STRIPE_USE_CHECKOUT}
            actions={{
                createPaymentIntent,    // For embedded form
                createSubscription,     // For embedded form
                updateSubscription,
                cancelSubscription,
                createCustomerPortalSession
            }}
        />
    )
}
```

**Important:** All four actions (`createPaymentIntent`, `createSubscription`, `cancelSubscription`, `createCustomerPortalSession`) must be passed to the BillingForm for full functionality.

### 2. Webhook Route

Create a webhook endpoint at `app/api/webhook/stripe/route.ts`:

```ts
export { POST } from '@maggiezinger/nextjs-stripe/webhook'
```

### 3. Configure Stripe Webhooks

**Local Development:**
```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

**Production:**
Add webhook endpoint in Stripe Dashboard → Developers → Webhooks:
- URL: `https://yourdomain.com/api/webhook/stripe`
- Events to select:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `payment_intent.succeeded`
  - `checkout.session.completed` (if using Stripe Checkout)

## Database Setup

### 1. Copy Migration Files

Copy **both** migration files from the package to your app:

```bash
cp node_modules/@maggiezinger/nextjs-stripe/supabase/migrations/20250601090000_add_stripe_fields_to_profiles.sql supabase/migrations/
```

Create a new migration for `stripe_trial_end`:

```sql
-- supabase/migrations/[timestamp]_add_stripe_trial_end.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_trial_end TIMESTAMPTZ;
```

### 2. Run Migrations

```bash
npx supabase db reset --local
```

### Database Schema

The package adds these columns to the `profiles` table:

| Column | Type | Description |
|--------|------|-------------|
| `stripe_customer_id` | TEXT | Stripe customer ID |
| `stripe_subscription_id` | TEXT | Current subscription ID |
| `stripe_subscription_status` | TEXT | Subscription status (active, canceled, past_due, etc.) |
| `stripe_price_id` | TEXT | Current subscription price ID |
| `stripe_current_period_end` | TIMESTAMPTZ | When subscription renews/ends |
| `stripe_trial_end` | TIMESTAMPTZ | When trial period ends (if applicable) |
| `feature_flags` | JSONB | Array of granted feature flags |

## UI Components

The package exports UI components that can be used independently:

```tsx
import { Button } from '@maggiezinger/nextjs-stripe/ui/button'
import { Badge } from '@maggiezinger/nextjs-stripe/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@maggiezinger/nextjs-stripe/ui/card'
```

## Subscription Status Display

The BillingForm automatically displays:

- **Subscription Status Badges:**
  - 🟢 Active / Trialing (green)
  - 🟡 Past Due / Incomplete (yellow)
  - 🔴 Canceled / Unpaid (red)

- **Payment Failure Warnings:** Prominent warning with "Update Payment Method" button when payments fail

- **Trial Period Info:** Blue banner showing trial end date (when trials are configured)

- **Manage Billing:** Direct link to Stripe Customer Portal for:
  - Updating payment methods
  - Viewing invoices
  - Downloading receipts
  - Retrying failed payments

## Feature Flags

Access control based on purchased plans:

```tsx
import { getBillingProfile } from '@maggiezinger/nextjs-stripe/billing/server'

export default async function ProtectedPage() {
    const { profile } = await getBillingProfile()
    const flags = Array.isArray(profile?.feature_flags) ? profile.feature_flags : []
    
    if (!flags.includes('pro_content')) {
        return <div>This content requires Pro subscription</div>
    }
    
    return <div>Protected content here</div>
}
```

## Customizing Plans

Edit `src/billing/plans.ts` in the package to modify billing plans:

```ts
export const billingPlans: BillingPlan[] = [
  {
    id: 'content-pack',
    name: 'Content Pack',
    description: 'One-time purchase',
    priceId: env.STRIPE_PRICE_CONTENT_PACK,
    amount: 1500,  // £15.00 in pence
    currency: 'gbp',
    interval: 'one_time',
    flags: ['content_access']
  },
  // ... more plans
]
```

## Troubleshooting

### Webhook not updating database

1. **Check webhook is receiving events:**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook/stripe
   ```

2. **Check for errors in terminal:** Look for `[Webhook]` logs in your Next.js server console

3. **Verify migrations ran:** Ensure all database columns exist:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'profiles' AND column_name LIKE 'stripe_%';
   ```

4. **Check service role key:** Webhooks use `SUPABASE_SERVICE_ROLE_KEY` - ensure it's set correctly

### "createCustomerPortalSession is not a function"

Ensure you're passing all required actions to BillingForm:
```tsx
actions={{ 
    createPaymentIntent,
    createSubscription,
    cancelSubscription,
    createCustomerPortalSession  // Don't forget this!
}}
```

### Subscription shows but UI doesn't update

1. Refresh the page (webhook updates may take a moment)
2. Check that `getBillingProfile()` is being called on the page
3. Verify the profile columns are being selected in the query

## Build

```
npm run build
```

## Development

This package is distributed via Git with pre-built files (the `dist/` folder is committed).

**When making changes:**

1. Make your code changes in `src/`
2. Build the package: `npm run build`
3. Commit both source and built files: `git add src/ dist/`
4. Push to GitHub

**Why commit dist/?** When installing from Git, npm can't build the package because peer dependencies (Next.js, React) aren't available during installation. Pre-building solves this.

## Package Exports

```typescript
// Server actions
'@maggiezinger/nextjs-stripe/billing/server'
  - createCheckoutSession()        // For Stripe Checkout
  - createPaymentIntent()          // For embedded form
  - createSubscription()           // For embedded form
  - cancelSubscription()
  - updateSubscription()
  - createCustomerPortalSession()
  - getBillingProfile()
  - getBillingPlansWithStripePricing()

// Client components
'@maggiezinger/nextjs-stripe/billing/client'
  - BillingForm

// Webhook handler
'@maggiezinger/nextjs-stripe/webhook'
  - POST

// Environment
'@maggiezinger/nextjs-stripe/env/server'
  - env

// UI Components
'@maggiezinger/nextjs-stripe/ui/button'
'@maggiezinger/nextjs-stripe/ui/badge'
'@maggiezinger/nextjs-stripe/ui/card'
```

## Testing

### Testing Stripe Checkout Mode (Default)

1. Set `STRIPE_USE_CHECKOUT=true` (or leave unset)
2. Start your app and navigate to the billing page
3. Click "Buy now" or "Subscribe" on a plan
4. You should be redirected to Stripe's hosted checkout page
5. Complete payment with test card: `4242 4242 4242 4242`
6. You'll be redirected back to `/billing?success=true`
7. Verify webhooks update your profile's feature flags

### Testing Custom Embedded Form

1. Set `STRIPE_USE_CHECKOUT=false`
2. Start your app and navigate to the billing page
3. Click "Buy now" or "Subscribe" on a plan
4. Payment form should appear inline (no redirect)
5. Complete payment with test card: `4242 4242 4242 4242`
6. Verify webhooks update your profile's feature flags

### Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
# Start webhook forwarding
stripe listen --forward-to localhost:3000/api/webhook/stripe

# In another terminal, test specific events
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

### Common Test Cards

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

For more test cards, see [Stripe Testing Docs](https://stripe.com/docs/testing).
