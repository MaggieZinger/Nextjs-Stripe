declare const env: {
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_PRICE_CONTENT_PACK: string;
    STRIPE_PRICE_PRO_MONTHLY: string;
    STRIPE_PRICE_PRO_ANNUAL: string;
    STRIPE_USE_CHECKOUT: boolean;
    NODE_ENV: "development" | "production" | "test";
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
};

export { env };
