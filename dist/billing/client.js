"use client";

// src/billing/BillingForm.tsx
import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

// src/stripe/client.ts
import { loadStripe } from "@stripe/stripe-js";

// src/env/client.ts
import { z } from "zod";
var clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1)
});
var clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
});

// src/stripe/client.ts
var stripePromise = loadStripe(clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// src/ui/button.tsx
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

// src/ui/cn.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/ui/button.tsx
import { jsx } from "react/jsx-runtime";
var buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "button",
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}

// src/ui/card.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function Card({ className, ...props }) {
  return /* @__PURE__ */ jsx2(
    "div",
    {
      "data-slot": "card",
      className: cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      ),
      ...props
    }
  );
}
function CardHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx2(
    "div",
    {
      "data-slot": "card-header",
      className: cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      ),
      ...props
    }
  );
}
function CardTitle({ className, ...props }) {
  return /* @__PURE__ */ jsx2(
    "div",
    {
      "data-slot": "card-title",
      className: cn("leading-none font-semibold", className),
      ...props
    }
  );
}
function CardDescription({ className, ...props }) {
  return /* @__PURE__ */ jsx2(
    "div",
    {
      "data-slot": "card-description",
      className: cn("text-muted-foreground text-sm", className),
      ...props
    }
  );
}
function CardContent({ className, ...props }) {
  return /* @__PURE__ */ jsx2(
    "div",
    {
      "data-slot": "card-content",
      className: cn("px-6", className),
      ...props
    }
  );
}

// src/ui/badge.tsx
import { cva as cva2 } from "class-variance-authority";
import { jsx as jsx3 } from "react/jsx-runtime";
var badgeVariants = cva2(
  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        success: "bg-green-50 text-green-700 ring-green-600/20",
        warning: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
        error: "bg-red-50 text-red-700 ring-red-600/20"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({ className, variant, ...props }) {
  return /* @__PURE__ */ jsx3("div", { className: `${badgeVariants({ variant })} ${className ?? ""}`, ...props });
}

// src/billing/BillingForm.tsx
import { jsx as jsx4, jsxs } from "react/jsx-runtime";
var PaymentForm = ({ onClose, paymentElementOptions }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setMessage(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/dashboard/billing` },
      redirect: "if_required"
    });
    if (result.error) {
      setMessage(result.error.message ?? "Payment failed.");
    } else {
      setMessage("Payment submitted. Updates may take a moment to appear.");
      onClose();
    }
    setIsSubmitting(false);
  };
  return /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
    /* @__PURE__ */ jsx4(PaymentElement, { options: paymentElementOptions }),
    message ? /* @__PURE__ */ jsx4("p", { className: "text-sm text-muted-foreground", children: message }) : null,
    /* @__PURE__ */ jsx4(Button, { type: "submit", disabled: !stripe || isSubmitting, children: isSubmitting ? "Processing..." : "Confirm payment" })
  ] });
};
var BillingForm = ({ plans, profile, actions }) => {
  const [clientSecret, setClientSecret] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelMessage, setCancelMessage] = useState(null);
  const formatter = useMemo(
    () => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }),
    []
  );
  const featureFlags = Array.isArray(profile?.feature_flags) ? profile?.feature_flags : [];
  const paymentElementOptions = { layout: "tabs" };
  const isPlanActive = (plan) => {
    if (plan.interval === "one_time") {
      return plan.flags.some((flag) => featureFlags.includes(flag));
    }
    return profile?.stripe_price_id === plan.priceId && profile?.stripe_subscription_status === "active";
  };
  const isSubscriptionActive = (plan) => {
    return plan.interval !== "one_time" && profile?.stripe_price_id === plan.priceId && profile?.stripe_subscription_status === "active";
  };
  const handleSelectPlan = (plan) => {
    setError(null);
    setSelectedPlan(plan);
    setClientSecret(null);
    startTransition(async () => {
      const response = plan.interval === "one_time" ? await actions.createPaymentIntent(plan.priceId) : await actions.createSubscription(plan.priceId);
      if (response?.error) {
        setError(response.error);
        return;
      }
      setClientSecret(response?.clientSecret ?? null);
    });
  };
  const handleCancelClick = () => {
    setShowCancelDialog(true);
    setCancelMessage(null);
  };
  const handleCancelConfirm = () => {
    setError(null);
    setCancelMessage(null);
    startTransition(async () => {
      const response = await actions.cancelSubscription();
      if (response?.error) {
        setError(response.error);
        setShowCancelDialog(false);
        return;
      }
      if (response?.success) {
        const cancelDate = response.cancelAt ? new Date(response.cancelAt).toLocaleDateString() : "the end of your billing period";
        setCancelMessage(`Your subscription will be canceled on ${cancelDate}. You'll retain access until then.`);
        setShowCancelDialog(false);
      }
    });
  };
  const hasActiveSubscription = profile?.stripe_subscription_status === "active" && profile?.stripe_subscription_id;
  const getSubscriptionStatusBadge = () => {
    const status = profile?.stripe_subscription_status;
    if (!status) return null;
    const statusConfig = {
      active: { label: "Active", variant: "success" },
      trialing: { label: "Trial", variant: "success" },
      past_due: { label: "Past Due", variant: "warning" },
      canceled: { label: "Canceled", variant: "error" },
      unpaid: { label: "Unpaid", variant: "error" },
      incomplete: { label: "Incomplete", variant: "warning" },
      incomplete_expired: { label: "Expired", variant: "error" },
      paused: { label: "Paused", variant: "default" }
    };
    const config = statusConfig[status];
    if (!config) return /* @__PURE__ */ jsx4(Badge, { children: status });
    return /* @__PURE__ */ jsx4(Badge, { variant: config.variant, children: config.label });
  };
  const handleManagePaymentClick = () => {
    startTransition(async () => {
      const response = await actions.createCustomerPortalSession(window.location.href);
      if (response?.error) {
        setError(response.error);
        return;
      }
      if (response?.url) {
        window.location.href = response.url;
      }
    });
  };
  const isPaymentFailed = profile?.stripe_subscription_status === "past_due" || profile?.stripe_subscription_status === "unpaid";
  const isInTrial = profile?.stripe_subscription_status === "trialing";
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx4(CardTitle, { children: "Your Access" }),
        /* @__PURE__ */ jsx4(CardDescription, { children: profile?.stripe_subscription_status ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
          /* @__PURE__ */ jsx4("span", { children: "Status:" }),
          getSubscriptionStatusBadge()
        ] }) : /* @__PURE__ */ jsx4("span", { children: "No active subscription" }) })
      ] }),
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3", children: [
        isPaymentFailed && /* @__PURE__ */ jsxs("div", { className: "rounded-md bg-yellow-50 p-3 border border-yellow-200", children: [
          /* @__PURE__ */ jsx4("p", { className: "text-sm font-medium text-yellow-800", children: "Payment Required" }),
          /* @__PURE__ */ jsx4("p", { className: "text-sm text-yellow-700 mt-1", children: "Your last payment failed. Please update your payment method to maintain access." }),
          /* @__PURE__ */ jsx4(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: handleManagePaymentClick,
              disabled: isPending,
              className: "mt-2 bg-white hover:bg-yellow-50",
              children: isPending ? "Loading..." : "Update Payment Method"
            }
          )
        ] }),
        isInTrial && profile?.stripe_trial_end && /* @__PURE__ */ jsxs("div", { className: "rounded-md bg-blue-50 p-3 border border-blue-200", children: [
          /* @__PURE__ */ jsx4("p", { className: "text-sm font-medium text-blue-800", children: "Trial Period" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm text-blue-700", children: [
            "Your trial ends on ",
            new Date(profile.stripe_trial_end).toLocaleDateString()
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
          /* @__PURE__ */ jsx4("p", { className: "font-medium text-muted-foreground mb-1", children: "Active Features:" }),
          /* @__PURE__ */ jsx4("p", { className: "text-foreground", children: featureFlags.length ? featureFlags.join(", ") : "None" })
        ] }),
        profile?.stripe_current_period_end && /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
          /* @__PURE__ */ jsx4("p", { className: "font-medium text-muted-foreground mb-1", children: profile.stripe_subscription_status === "canceled" ? "Access ends:" : "Renews:" }),
          /* @__PURE__ */ jsx4("p", { className: "text-foreground", children: new Date(profile.stripe_current_period_end).toLocaleDateString() })
        ] }),
        cancelMessage && /* @__PURE__ */ jsx4("p", { className: "text-sm text-muted-foreground p-2 bg-muted rounded", children: cancelMessage }),
        hasActiveSubscription && !cancelMessage && /* @__PURE__ */ jsxs("div", { className: "flex gap-2 pt-2", children: [
          /* @__PURE__ */ jsx4(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: handleCancelClick,
              disabled: isPending,
              children: "Cancel Subscription"
            }
          ),
          /* @__PURE__ */ jsx4(
            Button,
            {
              variant: "outline",
              size: "sm",
              onClick: handleManagePaymentClick,
              disabled: isPending,
              children: "Manage Billing"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "grid gap-4 md:grid-cols-3", children: plans.map((plan) => {
      const isActive = isPlanActive(plan);
      const isActiveSubscription = isSubscriptionActive(plan);
      return /* @__PURE__ */ jsxs(Card, { className: isActive ? "border-primary" : "", children: [
        /* @__PURE__ */ jsx4(CardHeader, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx4(CardTitle, { children: plan.name }),
            /* @__PURE__ */ jsx4(CardDescription, { children: plan.description })
          ] }),
          isActiveSubscription && /* @__PURE__ */ jsx4("span", { className: "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground", children: "Current Plan" }),
          isActive && plan.interval === "one_time" && /* @__PURE__ */ jsx4("span", { className: "rounded-md bg-secondary px-2 py-1 text-xs font-medium", children: "Owned" })
        ] }) }),
        /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-2xl font-semibold", children: [
            formatter.format(plan.amount / 100),
            plan.interval === "month" ? "/mo" : plan.interval === "year" ? "/yr" : ""
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
            "Flags: ",
            plan.flags.join(", ")
          ] }),
          isActiveSubscription && profile?.stripe_current_period_end && /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
            "Renews: ",
            new Date(profile.stripe_current_period_end).toLocaleDateString()
          ] }),
          /* @__PURE__ */ jsx4(
            Button,
            {
              onClick: () => handleSelectPlan(plan),
              disabled: isPending || isActiveSubscription,
              className: "w-full",
              variant: isActiveSubscription ? "secondary" : "default",
              children: isActiveSubscription ? "Manage Subscription" : plan.interval === "one_time" ? "Buy now" : "Subscribe"
            }
          )
        ] })
      ] }, plan.id);
    }) }),
    error ? /* @__PURE__ */ jsx4("p", { className: "text-sm text-destructive", children: error }) : null,
    showCancelDialog ? /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx4(CardTitle, { children: "Cancel Subscription" }),
        /* @__PURE__ */ jsx4(CardDescription, { children: "Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period." })
      ] }),
      /* @__PURE__ */ jsxs(CardContent, { className: "flex gap-3", children: [
        /* @__PURE__ */ jsx4(
          Button,
          {
            variant: "destructive",
            onClick: handleCancelConfirm,
            disabled: isPending,
            children: isPending ? "Canceling..." : "Yes, cancel subscription"
          }
        ),
        /* @__PURE__ */ jsx4(
          Button,
          {
            variant: "outline",
            onClick: () => setShowCancelDialog(false),
            disabled: isPending,
            children: "Keep subscription"
          }
        )
      ] })
    ] }) : null,
    clientSecret && selectedPlan ? /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsx4(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { children: [
        "Complete payment for ",
        selectedPlan.name
      ] }) }),
      /* @__PURE__ */ jsx4(CardContent, { children: /* @__PURE__ */ jsx4(Elements, { stripe: stripePromise, options: { clientSecret }, children: /* @__PURE__ */ jsx4(
        PaymentForm,
        {
          onClose: () => setClientSecret(null),
          paymentElementOptions
        }
      ) }) })
    ] }) : null
  ] });
};
export {
  BillingForm
};
//# sourceMappingURL=client.js.map