// src/webhook/stripe.ts
import { headers } from "next/headers";

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
  STRIPE_USE_CHECKOUT: z.string().optional().transform((val) => val !== "false").default("true"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development")
});
var env = envSchema.parse(process.env);

// src/stripe/server.ts
var stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20"
});

// src/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";
var createAdminClient = () => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations.");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
};

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
    stripe_price_id: priceIds[0] ?? null,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    stripe_trial_end: toIsoString(subscription.trial_end),
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
var handleCheckoutSessionCompleted = async (session) => {
  if (session.mode === "payment" && session.payment_intent) {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id
    );
    await handlePaymentIntentSucceeded(paymentIntent);
  }
  if (session.mode === "subscription" && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(
      typeof session.subscription === "string" ? session.subscription : session.subscription.id
    );
    await handleSubscriptionUpdate(subscription);
  }
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
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
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
  POST
};
//# sourceMappingURL=index.js.map