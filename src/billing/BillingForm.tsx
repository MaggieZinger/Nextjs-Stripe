'use client'

import { useMemo, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { stripePromise } from '../stripe/client'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

export type BillingPlan = {
  id: string
  name: string
  description: string
  priceId: string
  amount: number
  currency: 'gbp'
  interval: 'one_time' | 'month' | 'year'
  flags: string[]
}

type BillingProfile = {
  stripe_subscription_status: string | null
  stripe_current_period_end: string | null
  feature_flags: unknown
}

type BillingActions = {
  createPaymentIntent: (priceId: string) => Promise<{ clientSecret?: string | null; error?: string }>
  createSubscription: (priceId: string) => Promise<{ clientSecret?: string | null; error?: string }>
}

type BillingFormProps = {
  plans: BillingPlan[]
  profile: BillingProfile | null
  actions: BillingActions
}

type PaymentFormProps = {
  onClose: () => void
  paymentElementOptions: StripePaymentElementOptions
}

const PaymentForm = ({ onClose, paymentElementOptions }: PaymentFormProps) => {
  const stripe = useStripe()
  const elements = useElements()
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!stripe || !elements) return

    setIsSubmitting(true)
    setMessage(null)

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/dashboard/billing` },
      redirect: 'if_required'
    })

    if (result.error) {
      setMessage(result.error.message ?? 'Payment failed.')
    } else {
      setMessage('Payment submitted. Updates may take a moment to appear.')
      onClose()
    }

    setIsSubmitting(false)
  }

  return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement options={paymentElementOptions} />
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <Button type="submit" disabled={!stripe || isSubmitting}>
          {isSubmitting ? 'Processing...' : 'Confirm payment'}
        </Button>
      </form>
  )
}

export const BillingForm = ({ plans, profile, actions }: BillingFormProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const formatter = useMemo(
      () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
      []
  )

  const featureFlags = Array.isArray(profile?.feature_flags)
      ? (profile?.feature_flags as string[])
      : []

  const paymentElementOptions: StripePaymentElementOptions = { layout: 'tabs' }

  const handleSelectPlan = (plan: BillingPlan) => {
    setError(null)
    setSelectedPlan(plan)
    setClientSecret(null)

    startTransition(async () => {
      const response =
          plan.interval === 'one_time'
              ? await actions.createPaymentIntent(plan.priceId)
              : await actions.createSubscription(plan.priceId)

      if (response?.error) {
        setError(response.error)
        return
      }

      setClientSecret(response?.clientSecret ?? null)
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
          <CardDescription>
            Subscription status: {profile?.stripe_subscription_status ?? 'none'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Current flags:{' '}
            {featureFlags.length ? featureFlags.join(', ') : 'none'}
          </p>
          {profile?.stripe_current_period_end ? (
            <p>Access ends: {new Date(profile.stripe_current_period_end).toLocaleDateString()}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-semibold">
                {formatter.format(plan.amount / 100)}
                {plan.interval === 'month' ? '/mo' : plan.interval === 'year' ? '/yr' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Flags: {plan.flags.join(', ')}
              </p>
              <Button
                onClick={() => handleSelectPlan(plan)}
                disabled={isPending}
                className="w-full"
              >
                {plan.interval === 'one_time' ? 'Buy now' : 'Subscribe'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {clientSecret && selectedPlan ? (
        <Card>
          <CardHeader>
            <CardTitle>Complete payment for {selectedPlan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm
                onClose={() => setClientSecret(null)}
                paymentElementOptions={paymentElementOptions}
              />
            </Elements>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
