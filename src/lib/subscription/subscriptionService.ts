/**
 * @deprecated — StoreKit subscription service has been replaced by Stripe.
 * Use @/lib/stripe/stripeService instead.
 * 
 * This file is kept as a thin compatibility shim for any lingering imports.
 */

export interface EntitlementState {
  isPro: boolean;
  isTrial: boolean;
  trialEndsAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  willRenew: boolean | null;
  lastCheckedAt: Date;
  source: 'stripe' | 'cached';
  isOffline: boolean;
  error: { code: string; message: string } | null;
}

export interface StoreProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  priceValue: number;
  currencyCode: string;
  hasTrialOffer: boolean;
}

const DEFAULT_STATE: EntitlementState = {
  isPro: false,
  isTrial: false,
  trialEndsAt: null,
  isActive: false,
  expiresAt: null,
  willRenew: null,
  lastCheckedAt: new Date(),
  source: 'cached',
  isOffline: false,
  error: null,
};

export async function getProducts(): Promise<StoreProduct[]> { return []; }
export async function refreshEntitlements(): Promise<EntitlementState> { return DEFAULT_STATE; }
export async function purchase(_productId: string): Promise<EntitlementState> { return DEFAULT_STATE; }
export async function restorePurchases(): Promise<EntitlementState> { return DEFAULT_STATE; }
export function getEntitlementState(): EntitlementState { return DEFAULT_STATE; }
