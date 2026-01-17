'use server'

import { createClient } from '../supabase/server'
import { stripe } from '../stripe/server'
import { billingPlans } from './plans'

const getPlanByPriceId = (priceId: string) =>
  billingPlans.find((plan) => plan.priceId === priceId)

const ensureStripeCustomer = async (userId: string, email?: string | null) => {
  const supabase = await createClient()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (error) {
    throw error
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: {
      supabase_user_id: userId
    }
  })

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  if (updateError) {
    throw updateError
  }

  return customer.id
}

export async function createPaymentIntent(priceId: string) {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const plan = getPlanByPriceId(priceId)
  if (!plan || plan.interval !== 'one_time') {
    return { error: 'Invalid price selection.' }
  }

  const customerId = await ensureStripeCustomer(
    userData.user.id,
    userData.user.email
  )

  const stripePrice = await stripe.prices.retrieve(priceId)
  if (
    !stripePrice.unit_amount ||
    stripePrice.currency !== plan.currency ||
    stripePrice.type !== 'one_time'
  ) {
    return { error: 'Price configuration error.' }
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: stripePrice.unit_amount,
    currency: stripePrice.currency,
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      price_id: priceId,
      supabase_user_id: userData.user.id
    }
  })

  return { clientSecret: paymentIntent.client_secret }
}

export async function createSubscription(priceId: string) {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const plan = getPlanByPriceId(priceId)
  if (!plan || plan.interval === 'one_time') {
    return { error: 'Invalid price selection.' }
  }

  const customerId = await ensureStripeCustomer(
    userData.user.id,
    userData.user.email
  )

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      price_id: priceId,
      supabase_user_id: userData.user.id
    }
  })

  if (!subscription.latest_invoice || typeof subscription.latest_invoice === 'string') {
    return { error: 'Subscription payment could not be initialized.' }
  }

  const paymentIntent = subscription.latest_invoice.payment_intent
  if (!paymentIntent || typeof paymentIntent === 'string') {
    return { error: 'Subscription payment could not be initialized.' }
  }

  return {
    clientSecret: paymentIntent.client_secret,
    subscriptionId: subscription.id
  }
}

export async function getBillingProfile() {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      'stripe_subscription_status, stripe_current_period_end, feature_flags'
    )
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { profile }
}
