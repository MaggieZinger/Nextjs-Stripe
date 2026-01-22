'use client'

import { useMemo, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { stripePromise } from '../stripe/client'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

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
  stripe_price_id: string | null
  stripe_current_period_end: string | null
  stripe_subscription_id: string | null
  stripe_trial_end: string | null
  feature_flags: unknown
}

type BillingActions = {
  createPaymentIntent: (priceId: string) => Promise<{ clientSecret?: string | null; error?: string }>
  createSubscription: (priceId: string) => Promise<{ clientSecret?: string | null; error?: string }>
  cancelSubscription: () => Promise<{ success?: boolean; cancelAt?: string | null; error?: string }>
  createCustomerPortalSession: (returnUrl: string) => Promise<{ url?: string; error?: string }>
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
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)

  const formatter = useMemo(
      () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
      []
  )

  const featureFlags = Array.isArray(profile?.feature_flags)
      ? (profile?.feature_flags as string[])
      : []

  const paymentElementOptions: StripePaymentElementOptions = { layout: 'tabs' }

  const isPlanActive = (plan: BillingPlan) => {
    if (plan.interval === 'one_time') {
      return plan.flags.some(flag => featureFlags.includes(flag))
    }
    return profile?.stripe_price_id === plan.priceId && 
           profile?.stripe_subscription_status === 'active'
  }

  const isSubscriptionActive = (plan: BillingPlan) => {
    return plan.interval !== 'one_time' && 
           profile?.stripe_price_id === plan.priceId &&
           profile?.stripe_subscription_status === 'active'
  }

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

  const handleCancelClick = () => {
    setShowCancelDialog(true)
    setCancelMessage(null)
  }

  const handleCancelConfirm = () => {
    setError(null)
    setCancelMessage(null)
    
    startTransition(async () => {
      const response = await actions.cancelSubscription()

      if (response?.error) {
        setError(response.error)
        setShowCancelDialog(false)
        return
      }

      if (response?.success) {
        const cancelDate = response.cancelAt 
          ? new Date(response.cancelAt).toLocaleDateString()
          : 'the end of your billing period'
        setCancelMessage(`Your subscription will be canceled on ${cancelDate}. You'll retain access until then.`)
        setShowCancelDialog(false)
      }
    })
  }

  const hasActiveSubscription = profile?.stripe_subscription_status === 'active' && 
                                  profile?.stripe_subscription_id

  const getSubscriptionStatusBadge = () => {
    const status = profile?.stripe_subscription_status
    if (!status) return null

    const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
      active: { label: 'Active', variant: 'success' },
      trialing: { label: 'Trial', variant: 'success' },
      past_due: { label: 'Past Due', variant: 'warning' },
      canceled: { label: 'Canceled', variant: 'error' },
      unpaid: { label: 'Unpaid', variant: 'error' },
      incomplete: { label: 'Incomplete', variant: 'warning' },
      incomplete_expired: { label: 'Expired', variant: 'error' },
      paused: { label: 'Paused', variant: 'default' },
    }

    const config = statusConfig[status]
    if (!config) return <Badge>{status}</Badge>

    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const handleManagePaymentClick = () => {
    startTransition(async () => {
      const response = await actions.createCustomerPortalSession(window.location.href)
      
      if (response?.error) {
        setError(response.error)
        return
      }

      if (response?.url) {
        window.location.href = response.url
      }
    })
  }

  const isPaymentFailed = profile?.stripe_subscription_status === 'past_due' || 
                          profile?.stripe_subscription_status === 'unpaid'

  const isInTrial = profile?.stripe_subscription_status === 'trialing'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Access</CardTitle>
          <CardDescription>
            {profile?.stripe_subscription_status ? (
              <div className="flex items-center gap-2 mt-2">
                <span>Status:</span>
                {getSubscriptionStatusBadge()}
              </div>
            ) : (
              <span>No active subscription</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Payment failure warning */}
          {isPaymentFailed && (
            <div className="rounded-md bg-yellow-50 p-3 border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800">Payment Required</p>
              <p className="text-sm text-yellow-700 mt-1">
                Your last payment failed. Please update your payment method to maintain access.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManagePaymentClick}
                disabled={isPending}
                className="mt-2 bg-white hover:bg-yellow-50"
              >
                {isPending ? 'Loading...' : 'Update Payment Method'}
              </Button>
            </div>
          )}

          {/* Trial information */}
          {isInTrial && profile?.stripe_trial_end && (
            <div className="rounded-md bg-blue-50 p-3 border border-blue-200">
              <p className="text-sm font-medium text-blue-800">Trial Period</p>
              <p className="text-sm text-blue-700">
                Your trial ends on {new Date(profile.stripe_trial_end).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Feature flags */}
          <div className="text-sm">
            <p className="font-medium text-muted-foreground mb-1">Active Features:</p>
            <p className="text-foreground">
              {featureFlags.length ? featureFlags.join(', ') : 'None'}
            </p>
          </div>

          {/* Access period */}
          {profile?.stripe_current_period_end && (
            <div className="text-sm">
              <p className="font-medium text-muted-foreground mb-1">
                {profile.stripe_subscription_status === 'canceled' ? 'Access ends:' : 'Renews:'}
              </p>
              <p className="text-foreground">
                {new Date(profile.stripe_current_period_end).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Cancellation message */}
          {cancelMessage && (
            <p className="text-sm text-muted-foreground p-2 bg-muted rounded">{cancelMessage}</p>
          )}

          {/* Action buttons */}
          {hasActiveSubscription && !cancelMessage && (
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCancelClick}
                disabled={isPending}
              >
                Cancel Subscription
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManagePaymentClick}
                disabled={isPending}
              >
                Manage Billing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isActive = isPlanActive(plan)
          const isActiveSubscription = isSubscriptionActive(plan)
          
          return (
            <Card key={plan.id} className={isActive ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  {isActiveSubscription && (
                    <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                      Current Plan
                    </span>
                  )}
                  {isActive && plan.interval === 'one_time' && (
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                      Owned
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold">
                  {formatter.format(plan.amount / 100)}
                  {plan.interval === 'month' ? '/mo' : plan.interval === 'year' ? '/yr' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Flags: {plan.flags.join(', ')}
                </p>
                {isActiveSubscription && profile?.stripe_current_period_end && (
                  <p className="text-xs text-muted-foreground">
                    Renews: {new Date(profile.stripe_current_period_end).toLocaleDateString()}
                  </p>
                )}
                <Button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isPending || isActiveSubscription}
                  className="w-full"
                  variant={isActiveSubscription ? 'secondary' : 'default'}
                >
                  {isActiveSubscription 
                    ? 'Manage Subscription' 
                    : plan.interval === 'one_time' 
                      ? 'Buy now' 
                      : 'Subscribe'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showCancelDialog ? (
        <Card>
          <CardHeader>
            <CardTitle>Cancel Subscription</CardTitle>
            <CardDescription>
              Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              variant="destructive" 
              onClick={handleCancelConfirm}
              disabled={isPending}
            >
              {isPending ? 'Canceling...' : 'Yes, cancel subscription'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowCancelDialog(false)}
              disabled={isPending}
            >
              Keep subscription
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
