import { env } from '../env/server'
import { stripe } from '../stripe/server'

export type BillingPlan = {
  id: 'content_pack' | 'pro_monthly' | 'pro_annual'
  name: string
  description: string
  priceId: string
  amount: number
  currency: 'gbp'
  interval: 'one_time' | 'month' | 'year'
  flags: string[]
}

export const billingPlans: BillingPlan[] = [
  {
    id: 'content_pack',
    name: 'Content Pack',
    description: 'One-time access to premium content.',
    priceId: env.STRIPE_PRICE_CONTENT_PACK,
    amount: 1500,
    currency: 'gbp',
    interval: 'one_time',
    flags: ['content_pack']
  },
  {
    id: 'pro_monthly',
    name: 'Pro Monthly',
    description: 'Monthly subscription with downloads.',
    priceId: env.STRIPE_PRICE_PRO_MONTHLY,
    amount: 1200,
    currency: 'gbp',
    interval: 'month',
    flags: ['pro_content', 'download_access']
  },
  {
    id: 'pro_annual',
    name: 'Pro Annual',
    description: 'Annual subscription with support.',
    priceId: env.STRIPE_PRICE_PRO_ANNUAL,
    amount: 12000,
    currency: 'gbp',
    interval: 'year',
    flags: ['pro_content', 'download_access', 'priority_support']
  }
]

export const getBillingPlansWithStripePricing = async () => {
  'use server'
  const plans = await Promise.all(
    billingPlans.map(async (plan) => {
      try {
        const stripePrice = await stripe.prices.retrieve(plan.priceId)
        if (typeof stripePrice.unit_amount === 'number') {
          return {
            ...plan,
            amount: stripePrice.unit_amount
          }
        }
      } catch {
        return plan
      }

      return plan
    })
  )

  return plans
}

export const getFlagsForPriceIds = (priceIds: string[]) => {
  const flags = new Set<string>()

  billingPlans.forEach((plan) => {
    if (priceIds.includes(plan.priceId)) {
      plan.flags.forEach((flag) => flags.add(flag))
    }
  })

  return Array.from(flags)
}

export const subscriptionFlagSet = new Set(
  billingPlans
    .filter((plan) => plan.interval !== 'one_time')
    .flatMap((plan) => plan.flags)
)
