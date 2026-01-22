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
  console.log("[Webhook] Processing subscription update:", {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status
  });
  if (!subscription.customer) {
    console.log("[Webhook] No customer on subscription, skipping");
    return;
  }
  const priceIds = subscription.items.data.map((item) => item.price?.id).filter((id) => Boolean(id));
  console.log("[Webhook] Extracted price IDs:", priceIds);
  const flags = getFlagsForPriceIds(priceIds);
  console.log("[Webhook] Flags for price IDs:", flags);
  const currentFlags = await getProfileFlagsForCustomer(String(subscription.customer));
  console.log("[Webhook] Current profile flags:", currentFlags);
  const retainedFlags = currentFlags.filter((flag) => !subscriptionFlagSet.has(flag));
  const nextFlags = Array.from(/* @__PURE__ */ new Set([...retainedFlags, ...flags]));
  console.log("[Webhook] Next flags:", nextFlags);
  const updates = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_price_id: priceIds[0] ?? null,
    stripe_current_period_end: toIsoString(subscription.current_period_end),
    stripe_trial_end: toIsoString(subscription.trial_end),
    feature_flags: nextFlags
  };
  console.log("[Webhook] Updating profile with:", updates);
  await updateProfileForCustomer(String(subscription.customer), updates);
  console.log("[Webhook] Profile updated successfully");
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
    console.log("[Webhook] Received event:", event.type);
    switch (event.type) {
      case "payment_intent.succeeded":
        console.log("[Webhook] Processing payment_intent.succeeded");
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case "invoice.paid":
        console.log("[Webhook] Processing invoice.paid");
        await handleInvoicePaid(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        console.log("[Webhook] Processing subscription event:", event.type);
        await handleSubscriptionUpdate(event.data.object);
        break;
      case "customer.subscription.deleted":
        console.log("[Webhook] Processing customer.subscription.deleted");
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log("[Webhook] Unhandled event type:", event.type);
        break;
    }
    console.log("[Webhook] Successfully processed event:", event.type);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error.";
    console.error("[Webhook] Error processing event:", error);
    return new Response(message, { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
export {
  POST
};
//# sourceMappingURL=index.js.map