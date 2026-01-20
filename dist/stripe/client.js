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
export {
  stripePromise
};
//# sourceMappingURL=client.js.map