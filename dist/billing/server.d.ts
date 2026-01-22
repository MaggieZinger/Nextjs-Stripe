declare function createPaymentIntent(priceId: string): Promise<{
    error: string;
    clientSecret?: undefined;
} | {
    clientSecret: string | null;
    error?: undefined;
}>;
declare function createSubscription(priceId: string): Promise<{
    error: string;
    clientSecret?: undefined;
    subscriptionId?: undefined;
} | {
    clientSecret: string | null;
    subscriptionId: string;
    error?: undefined;
}>;
declare function getBillingProfile(): Promise<{
    error: string;
    profile?: undefined;
} | {
    profile: {
        stripe_subscription_status: any;
        stripe_price_id: any;
        stripe_current_period_end: any;
        stripe_trial_end: any;
        feature_flags: any;
        stripe_subscription_id: any;
    };
    error?: undefined;
}>;
declare function cancelSubscription(): Promise<{
    error: string;
    success?: undefined;
    cancelAt?: undefined;
} | {
    success: boolean;
    cancelAt: string | null;
    error?: undefined;
}>;
declare function createCustomerPortalSession(returnUrl: string): Promise<{
    error: string;
    url?: undefined;
} | {
    url: string;
    error?: undefined;
}>;

type BillingPlan = {
    id: 'content_pack' | 'pro_monthly' | 'pro_annual';
    name: string;
    description: string;
    priceId: string;
    amount: number;
    currency: 'gbp';
    interval: 'one_time' | 'month' | 'year';
    flags: string[];
};
declare const billingPlans: BillingPlan[];
declare const getBillingPlansWithStripePricing: () => Promise<BillingPlan[]>;
declare const getFlagsForPriceIds: (priceIds: string[]) => string[];
declare const subscriptionFlagSet: Set<string>;

export { type BillingPlan, billingPlans, cancelSubscription, createCustomerPortalSession, createPaymentIntent, createSubscription, getBillingPlansWithStripePricing, getBillingProfile, getFlagsForPriceIds, subscriptionFlagSet };
