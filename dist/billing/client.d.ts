import * as react_jsx_runtime from 'react/jsx-runtime';

type BillingPlan = {
    id: string;
    name: string;
    description: string;
    priceId: string;
    amount: number;
    currency: 'gbp';
    interval: 'one_time' | 'month' | 'year';
    flags: string[];
};
type BillingProfile = {
    stripe_subscription_status: string | null;
    stripe_price_id: string | null;
    stripe_current_period_end: string | null;
    feature_flags: unknown;
};
type BillingActions = {
    createPaymentIntent: (priceId: string) => Promise<{
        clientSecret?: string | null;
        error?: string;
    }>;
    createSubscription: (priceId: string) => Promise<{
        clientSecret?: string | null;
        error?: string;
    }>;
};
type BillingFormProps = {
    plans: BillingPlan[];
    profile: BillingProfile | null;
    actions: BillingActions;
};
declare const BillingForm: ({ plans, profile, actions }: BillingFormProps) => react_jsx_runtime.JSX.Element;

export { BillingForm };
