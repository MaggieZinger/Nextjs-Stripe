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
export {
  billingPlans,
  createPaymentIntent,
  createSubscription,
  getBillingPlansWithStripePricing,
  getBillingProfile,
  getFlagsForPriceIds,
  subscriptionFlagSet
};
//# sourceMappingURL=server.js.map