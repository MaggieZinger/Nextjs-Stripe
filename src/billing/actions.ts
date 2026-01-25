import { createClient } from '../supabase/server'
import { stripe } from '../stripe/server'
import { billingPlans } from './plans'
import { env } from '../env/server'
import { headers } from 'next/headers'

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

export async function createCheckoutSession(priceId: string) {
  'use server'
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const plan = getPlanByPriceId(priceId)
  if (!plan) {
    return { error: 'Invalid price selection.' }
  }

  const customerId = await ensureStripeCustomer(
    userData.user.id,
    userData.user.email
  )

  // Get the base URL from request headers
  const headerStore = await headers()
  const host = headerStore.get('host')
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/billing?success=true`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
      metadata: {
        price_id: priceId,
        supabase_user_id: userData.user.id
      }
    })

    return { url: session.url }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create checkout session.'
    return { error: message }
  }
}

export async function createPaymentIntent(priceId: string) {
  'use server'
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
  'use server'
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
  'use server'
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      'stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_trial_end, feature_flags, stripe_subscription_id'
    )
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { profile }
}

export async function cancelSubscription() {
  'use server'
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!profile?.stripe_subscription_id) {
    return { error: 'No active subscription found.' }
  }

  try {
    const subscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      { cancel_at_period_end: true }
    )

    return {
      success: true,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription.'
    return { error: message }
  }
}

export async function createCustomerPortalSession(returnUrl: string) {
  'use server'
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!profile?.stripe_customer_id) {
    return { error: 'No Stripe customer found. Please make a purchase first.' }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl
    })

    return { url: session.url }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create portal session.'
    return { error: message }
  }
}

export async function updateSubscription(newPriceId: string) {
  'use server'
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { error: 'Not authenticated.' }
  }

  // Validate the target plan
  const targetPlan = getPlanByPriceId(newPriceId)
  if (!targetPlan || targetPlan.interval === 'one_time') {
    return { error: 'Invalid plan selection. Only subscription plans are supported.' }
  }

  // Get current subscription
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, stripe_price_id, stripe_subscription_status')
    .eq('id', userData.user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!profile?.stripe_subscription_id) {
    return { error: 'No active subscription found.' }
  }

  if (profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
    return { error: 'Cannot change plans for inactive subscriptions.' }
  }

  // Check if trying to switch to the same plan
  if (profile.stripe_price_id === newPriceId) {
    return { error: 'You are already on this plan.' }
  }

  try {
    // Get the subscription to find the subscription item ID
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    
    if (!subscription.items.data[0]) {
      return { error: 'Subscription configuration error.' }
    }

    // Update the subscription with proration
    const updatedSubscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId
          }
        ],
        proration_behavior: 'create_prorations',
        metadata: {
          price_id: newPriceId,
          supabase_user_id: userData.user.id
        }
      }
    )

    return {
      success: true,
      newPeriodEnd: updatedSubscription.current_period_end 
        ? new Date(updatedSubscription.current_period_end * 1000).toISOString() 
        : null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update subscription.'
    return { error: message }
  }
}
