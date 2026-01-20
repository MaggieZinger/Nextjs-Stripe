// src/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
var createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(
            ({ name, value, options }) => cookieStore.set(name, value, options)
          );
        }
      }
    }
  );
};

// src/stripe/server.ts
import Stripe from "stripe";

// src/env/server.ts
import "server-only";
import { z } from "zod";
var envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_CONTENT_PACK: z.string().min(1),
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1),
  STRIPE_PRICE_PRO_ANNUAL: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development")
});
var env = envSchema.parse(process.env);

// src/stripe/server.ts
var stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20"
});

// src/billing/plans.ts
var billingPlans = [
  {
    id: "content_pack",
    name: "Content Pack",
    description: "One-time access to premium content.",
    priceId: env.STRIPE_PRICE_CONTENT_PACK,
    amount: 1500,
    currency: "gbp",
    interval: "one_time",
    flags: ["content_pack"]
  },
  {
    id: "pro_monthly",
    name: "Pro Monthly",
    description: "Monthly subscription with downloads.",
    priceId: env.STRIPE_PRICE_PRO_MONTHLY,
    amount: 1200,
    currency: "gbp",
    interval: "month",
    flags: ["pro_content", "download_access"]
  },
  {
    id: "pro_annual",
    name: "Pro Annual",
    description: "Annual subscription with support.",
    priceId: env.STRIPE_PRICE_PRO_ANNUAL,
    amount: 12e3,
    currency: "gbp",
    interval: "year",
    flags: ["pro_content", "download_access", "priority_support"]
  }
];
var getBillingPlansWithStripePricing = async () => {
  "use server";
  const plans = await Promise.all(
    billingPlans.map(async (plan) => {
      try {
        const stripePrice = await stripe.prices.retrieve(plan.priceId);
        if (typeof stripePrice.unit_amount === "number") {
          return {
            ...plan,
            amount: stripePrice.unit_amount
          };
        }
      } catch {
        return plan;
      }
      return plan;
    })
  );
  return plans;
};
var getFlagsForPriceIds = (priceIds) => {
  const flags = /* @__PURE__ */ new Set();
  billingPlans.forEach((plan) => {
    if (priceIds.includes(plan.priceId)) {
      plan.flags.forEach((flag) => flags.add(flag));
    }
  });
  return Array.from(flags);
};
var subscriptionFlagSet = new Set(
  billingPlans.filter((plan) => plan.interval !== "one_time").flatMap((plan) => plan.flags)
);

// src/billing/actions.ts
var getPlanByPriceId = (priceId) => billingPlans.find((plan) => plan.priceId === priceId);
var ensureStripeCustomer = async (userId, email) => {
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("stripe_customer_id").eq("id", userId).single();
  if (error) {
    throw error;
  }
  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }
  const customer = await stripe.customers.create({
    email: email ?? void 0,
    metadata: {
      supabase_user_id: userId
    }
  });
  const { error: updateError } = await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  if (updateError) {
    throw updateError;
  }
  return customer.id;
};
async function createPaymentIntent(priceId) {
  "use server";
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Not authenticated." };
  }
  const plan = getPlanByPriceId(priceId);
  if (!plan || plan.interval !== "one_time") {
    return { error: "Invalid price selection." };
  }
  const customerId = await ensureStripeCustomer(
    userData.user.id,
    userData.user.email
  );
  const stripePrice = await stripe.prices.retrieve(priceId);
  if (!stripePrice.unit_amount || stripePrice.currency !== plan.currency || stripePrice.type !== "one_time") {
    return { error: "Price configuration error." };
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
  });
  return { clientSecret: paymentIntent.client_secret };
}
async function createSubscription(priceId) {
  "use server";
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Not authenticated." };
  }
  const plan = getPlanByPriceId(priceId);
  if (!plan || plan.interval === "one_time") {
    return { error: "Invalid price selection." };
  }
  const customerId = await ensureStripeCustomer(
    userData.user.id,
    userData.user.email
  );
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: {
      price_id: priceId,
      supabase_user_id: userData.user.id
    }
  });
  if (!subscription.latest_invoice || typeof subscription.latest_invoice === "string") {
    return { error: "Subscription payment could not be initialized." };
  }
  const paymentIntent = subscription.latest_invoice.payment_intent;
  if (!paymentIntent || typeof paymentIntent === "string") {
    return { error: "Subscription payment could not be initialized." };
  }
  return {
    clientSecret: paymentIntent.client_secret,
    subscriptionId: subscription.id
  };
}
async function getBillingProfile() {
  "use server";
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Not authenticated." };
  }
  const { data: profile, error } = await supabase.from("profiles").select(
    "stripe_subscription_status, stripe_current_period_end, feature_flags"
  ).eq("id", userData.user.id).single();
  if (error) {
    return { error: error.message };
  }
  return { profile };
}

// src/billing/BillingForm.tsx
import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

// src/stripe/client.ts
import { loadStripe } from "@stripe/stripe-js";

// src/env/client.ts
import { z as z2 } from "zod";
var clientEnvSchema = z2.object({
  NEXT_PUBLIC_SUPABASE_URL: z2.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z2.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z2.string().min(1)
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

// src/billing/BillingForm.tsx
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var PaymentForm = ({ onClose, paymentElementOptions }) => {
  const stripe2 = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe2 || !elements) return;
    setIsSubmitting(true);
    setMessage(null);
    const result = await stripe2.confirmPayment({
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
    /* @__PURE__ */ jsx3(PaymentElement, { options: paymentElementOptions }),
    message ? /* @__PURE__ */ jsx3("p", { className: "text-sm text-muted-foreground", children: message }) : null,
    /* @__PURE__ */ jsx3(Button, { type: "submit", disabled: !stripe2 || isSubmitting, children: isSubmitting ? "Processing..." : "Confirm payment" })
  ] });
};
var BillingForm = ({ plans, profile, actions }) => {
  const [clientSecret, setClientSecret] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
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
    return plan.flags.some((flag) => featureFlags.includes(flag)) && profile?.stripe_subscription_status === "active";
  };
  const isSubscriptionActive = (plan) => {
    return plan.interval !== "one_time" && plan.flags.some((flag) => featureFlags.includes(flag)) && profile?.stripe_subscription_status === "active";
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
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx3(CardTitle, { children: "Your access" }),
        /* @__PURE__ */ jsxs(CardDescription, { children: [
          "Subscription status: ",
          profile?.stripe_subscription_status ?? "none"
        ] })
      ] }),
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-2 text-sm", children: [
        /* @__PURE__ */ jsxs("p", { children: [
          "Current flags:",
          " ",
          featureFlags.length ? featureFlags.join(", ") : "none"
        ] }),
        profile?.stripe_current_period_end ? /* @__PURE__ */ jsxs("p", { children: [
          "Access ends: ",
          new Date(profile.stripe_current_period_end).toLocaleDateString()
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "grid gap-4 md:grid-cols-3", children: plans.map((plan) => {
      const isActive = isPlanActive(plan);
      const isActiveSubscription = isSubscriptionActive(plan);
      return /* @__PURE__ */ jsxs(Card, { className: isActive ? "border-primary" : "", children: [
        /* @__PURE__ */ jsx3(CardHeader, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx3(CardTitle, { children: plan.name }),
            /* @__PURE__ */ jsx3(CardDescription, { children: plan.description })
          ] }),
          isActiveSubscription && /* @__PURE__ */ jsx3("span", { className: "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground", children: "Current Plan" }),
          isActive && plan.interval === "one_time" && /* @__PURE__ */ jsx3("span", { className: "rounded-md bg-secondary px-2 py-1 text-xs font-medium", children: "Owned" })
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
          /* @__PURE__ */ jsx3(
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
    error ? /* @__PURE__ */ jsx3("p", { className: "text-sm text-destructive", children: error }) : null,
    clientSecret && selectedPlan ? /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsx3(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { children: [
        "Complete payment for ",
        selectedPlan.name
      ] }) }),
      /* @__PURE__ */ jsx3(CardContent, { children: /* @__PURE__ */ jsx3(Elements, { stripe: stripePromise, options: { clientSecret }, children: /* @__PURE__ */ jsx3(
        PaymentForm,
        {
          onClose: () => setClientSecret(null),
          paymentElementOptions
        }
      ) }) })
    ] }) : null
  ] });
};

// src/webhook/stripe.ts
import { headers } from "next/headers";

// src/supabase/admin.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var createAdminClient = () => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations.");
  }
  return createClient2(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
};

// src/webhook/stripe.ts
var toIsoString = (unixSeconds) => {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1e3).toISOString();
};
var getProfileFlagsForCustomer = async (stripeCustomerId) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("profiles").select("feature_flags").eq("stripe_customer_id", stripeCustomerId).single();
  if (error) {
    throw error;
  }
  return Array.isArray(data?.feature_flags) ? data.feature_flags : [];
};
var updateProfileForCustomer = async (stripeCustomerId, updates) => {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update(updates).eq("stripe_customer_id", stripeCustomerId);
  if (error) {
    throw error;
  }
};
var handlePaymentIntentSucceeded = async (paymentIntent) => {
  const priceId = paymentIntent.metadata?.price_id;
  if (!priceId || !paymentIntent.customer) return;
  const flags = getFlagsForPriceIds([priceId]);
  const currentFlags = await getProfileFlagsForCustomer(String(paymentIntent.customer));
  const nextFlags = Array.from(/* @__PURE__ */ new Set([...currentFlags, ...flags]));
  await updateProfileForCustomer(String(paymentIntent.customer), {
    feature_flags: nextFlags
  });
};
var handleSubscriptionUpdate = async (subscription) => {
  if (!subscription.customer) return;
  const priceIds = subscription.items.data.map((item) => item.price?.id).filter((id) => Boolean(id));
  const flags = getFlagsForPriceIds(priceIds);
  const currentFlags = await getProfileFlagsForCustomer(String(subscription.customer));
  const retainedFlags = currentFlags.filter((flag) => !subscriptionFlagSet.has(flag));
  const nextFlags = Array.from(/* @__PURE__ */ new Set([...retainedFlags, ...flags]));
  await updateProfileForCustomer(String(subscription.customer), {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    feature_flags: nextFlags
  });
};
var handleSubscriptionDeleted = async (subscription) => {
  if (!subscription.customer) return;
  const currentFlags = await getProfileFlagsForCustomer(String(subscription.customer));
  const retainedFlags = currentFlags.filter((flag) => !subscriptionFlagSet.has(flag));
  await updateProfileForCustomer(String(subscription.customer), {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    feature_flags: retainedFlags
  });
};
var handleInvoicePaid = async (invoice) => {
  if (!invoice.subscription) return;
  const subscription = await stripe.subscriptions.retrieve(
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id
  );
  await handleSubscriptionUpdate(subscription);
};
async function POST(request) {
  const body = await request.text();
  const headerStore = await headers();
  const signature = headerStore.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe signature", { status: 400 });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook signature failed.";
    return new Response(message, { status: 400 });
  }
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error.";
    return new Response(message, { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
export {
  BillingForm,
  POST,
  billingPlans,
  createPaymentIntent,
  createSubscription,
  getBillingPlansWithStripePricing,
  getBillingProfile,
  getFlagsForPriceIds,
  subscriptionFlagSet
};
//# sourceMappingURL=index.js.map