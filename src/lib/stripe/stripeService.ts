/**
 * Stripe service — handles checkout, subscription checking, and customer portal.
 */
import { supabase } from '@/integrations/supabase/client';
import { STRIPE_PRICE_ID } from './stripeConfig';

/**
 * Create a Stripe Checkout session and redirect user to it.
 */
export async function redirectToCheckout(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      priceId: STRIPE_PRICE_ID,
      successUrl: `${window.location.origin}/`,
      cancelUrl: `${window.location.origin}/`,
    },
  });

  if (error) throw new Error(error.message || 'Failed to create checkout session');
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('No checkout URL returned');

  window.location.href = data.url;
}

export interface SubscriptionStatus {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  isTrial: boolean;
  trialEnd: string | null;
}

/**
 * Check the current user's subscription status via edge function.
 */
export async function checkSubscription(): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.functions.invoke('check-subscription');

  if (error) {
    console.warn('[Stripe] check-subscription failed:', error);
    return { subscribed: false, productId: null, subscriptionEnd: null, isTrial: false, trialEnd: null };
  }

  return {
    subscribed: data?.subscribed ?? false,
    productId: data?.product_id ?? null,
    subscriptionEnd: data?.subscription_end ?? null,
    isTrial: data?.is_trial ?? false,
    trialEnd: data?.trial_end ?? null,
  };
}

/**
 * Open the Stripe Customer Portal for subscription management.
 */
export async function openCustomerPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('customer-portal');

  if (error) throw new Error(error.message || 'Failed to open customer portal');
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('No portal URL returned');

  window.open(data.url, '_blank');
}
