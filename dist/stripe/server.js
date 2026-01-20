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
export {
  stripe
};
//# sourceMappingURL=server.js.map