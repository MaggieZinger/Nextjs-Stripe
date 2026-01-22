import Stripe from 'stripe'
import { headers } from 'next/headers'
import { stripe } from '../stripe/server'
import { createAdminClient } from '../supabase/admin'
import { getFlagsForPriceIds, subscriptionFlagSet } from '../billing/plans'
import { env } from '../env/server'

const toIsoString = (unixSeconds: number | null) => {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString()
}

const getProfileFlagsForCustomer = async (stripeCustomerId: string) => {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('feature_flags')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()

  if (error) {
    throw error
  }

  return Array.isArray(data?.feature_flags) ? (data.feature_flags as string[]) : []
}

const updateProfileForCustomer = async (
  stripeCustomerId: string,
  updates: Record<string, unknown>
) => {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('stripe_customer_id', stripeCustomerId)

  if (error) {
    throw error
  }
}

const handlePaymentIntentSucceeded = async (paymentIntent: Stripe.PaymentIntent) => {
  const priceId = paymentIntent.metadata?.price_id
  if (!priceId || !paymentIntent.customer) return

  const flags = getFlagsForPriceIds([priceId])
  const currentFlags = await getProfileFlagsForCustomer(String(paymentIntent.customer))
  const nextFlags = Array.from(new Set([...currentFlags, ...flags]))

  await updateProfileForCustomer(String(paymentIntent.customer), {
    feature_flags: nextFlags
  })
}

const handleSubscriptionUpdate = async (subscription: Stripe.Subscription) => {
  console.log('[Webhook] Processing subscription update:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status
  })

  if (!subscription.customer) {
    console.log('[Webhook] No customer on subscription, skipping')
    return
  }

  const priceIds = subscription.items.data
    .map((item) => item.price?.id)
    .filter((id): id is string => Boolean(id))

  console.log('[Webhook] Extracted price IDs:', priceIds)

  const flags = getFlagsForPriceIds(priceIds)
  console.log('[Webhook] Flags for price IDs:', flags)

  const currentFlags = await getProfileFlagsForCustomer(String(subscription.customer))
  console.log('[Webhook] Current profile flags:', currentFlags)

  const retainedFlags = currentFlags.filter((flag) => !subscriptionFlagSet.has(flag))
  const nextFlags = Array.from(new Set([...retainedFlags, ...flags]))
  console.log('[Webhook] Next flags:', nextFlags)

  const updates = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_price_id: priceIds[0] ?? null,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    stripe_trial_end: toIsoString(subscription.trial_end),
    feature_flags: nextFlags
  }
  console.log('[Webhook] Updating profile with:', updates)

  await updateProfileForCustomer(String(subscription.customer), updates)
  console.log('[Webhook] Profile updated successfully')
}

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  if (!subscription.customer) return

  const currentFlags = await getProfileFlagsForCustomer(String(subscription.customer))
  const retainedFlags = currentFlags.filter((flag) => !subscriptionFlagSet.has(flag))

  await updateProfileForCustomer(String(subscription.customer), {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    feature_flags: retainedFlags
  })
}

const handleInvoicePaid = async (invoice: Stripe.Invoice) => {
  if (!invoice.subscription) return

  const subscription = await stripe.subscriptions.retrieve(
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id
  )

  await handleSubscriptionUpdate(subscription)
}

export async function POST(request: Request) {
  const body = await request.text()
  const headerStore = await headers()
  const signature = headerStore.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe signature', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook signature failed.'
    return new Response(message, { status: 400 })
  }

  try {
    console.log('[Webhook] Received event:', event.type)

    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('[Webhook] Processing payment_intent.succeeded')
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'invoice.paid':
        console.log('[Webhook] Processing invoice.paid')
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        console.log('[Webhook] Processing subscription event:', event.type)
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        console.log('[Webhook] Processing customer.subscription.deleted')
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        console.log('[Webhook] Unhandled event type:', event.type)
        break
    }

    console.log('[Webhook] Successfully processed event:', event.type)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error.'
    console.error('[Webhook] Error processing event:', error)
    return new Response(message, { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
