/**
 * Subscription service — bridges StoreKit 2 via Capacitor plugin on native,
 * falls back to cached/mock state on web.
 *
 * On native iOS, this expects a Capacitor plugin "StoreKitPlugin" registered
 * with methods: getProducts, purchase, restorePurchases, getEntitlements.
 * For web preview / Android, it gracefully returns default state.
 */

import {
  DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID,
  ENTITLEMENT_CACHE_KEY,
  CACHE_MAX_AGE_MS,
} from './products';

// ── Types ────────────────────────────────────────────────────────

export interface EntitlementState {
  isPro: boolean;
  isTrial: boolean;
  trialEndsAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  willRenew: boolean | null;
  lastCheckedAt: Date;
  source: 'storekit' | 'cached';
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

// ── Helpers ──────────────────────────────────────────────────────

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

function isNative(): boolean {
  try {
    return typeof (window as any)?.Capacitor?.isNativePlatform === 'function'
      ? (window as any).Capacitor.isNativePlatform()
      : false;
  } catch {
    return false;
  }
}

function getPlugin(): any | null {
  try {
    if (!isNative()) return null;
    const { Plugins } = (window as any).Capacitor;
    return Plugins?.StoreKitPlugin ?? null;
  } catch {
    return null;
  }
}

// ── Cache ────────────────────────────────────────────────────────

function readCache(): EntitlementState | null {
  try {
    const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Rehydrate dates
    return {
      ...parsed,
      trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      lastCheckedAt: new Date(parsed.lastCheckedAt),
      source: 'cached' as const,
    };
  } catch {
    return null;
  }
}

function writeCache(state: EntitlementState) {
  try {
    localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(state));
  } catch {
    // Storage full — ignore
  }
}

function isCacheValid(cached: EntitlementState): boolean {
  const age = Date.now() - new Date(cached.lastCheckedAt).getTime();
  return age < CACHE_MAX_AGE_MS;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Fetch available products from the App Store.
 * Returns empty array on web.
 */
export async function getProducts(): Promise<StoreProduct[]> {
  const plugin = getPlugin();
  if (!plugin) return [];
  try {
    const result = await plugin.getProducts({
      productIds: [DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID],
    });
    return result?.products ?? [];
  } catch (err: any) {
    console.warn('[Subscription] getProducts failed:', err);
    return [];
  }
}

/**
 * Refresh entitlement state from StoreKit 2.
 * Falls back to cache if offline or on web.
 */
export async function refreshEntitlements(): Promise<EntitlementState> {
  const plugin = getPlugin();

  // Web or plugin unavailable — use cache
  if (!plugin) {
    const cached = readCache();
    if (cached) return { ...cached, source: 'cached', isOffline: !navigator.onLine };
    return { ...DEFAULT_STATE, isOffline: !navigator.onLine };
  }

  try {
    const result = await plugin.getEntitlements();
    const ent = result?.entitlements?.find((e: any) => e.id === 'pro' || e.productId === DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID);

    const state: EntitlementState = {
      isPro: !!ent?.isActive,
      isTrial: !!ent?.isTrial,
      trialEndsAt: ent?.trialExpiresAt ? new Date(ent.trialExpiresAt) : null,
      isActive: !!ent?.isActive,
      expiresAt: ent?.expiresAt ? new Date(ent.expiresAt) : null,
      willRenew: ent?.willRenew ?? null,
      lastCheckedAt: new Date(),
      source: 'storekit',
      isOffline: false,
      error: null,
    };

    writeCache(state);
    return state;
  } catch (err: any) {
    console.warn('[Subscription] refreshEntitlements failed:', err);
    // Offline fallback
    const cached = readCache();
    if (cached && isCacheValid(cached)) {
      return { ...cached, source: 'cached', isOffline: true };
    }
    return {
      ...DEFAULT_STATE,
      isOffline: true,
      error: { code: 'REFRESH_FAILED', message: err?.message || 'Could not verify subscription' },
    };
  }
}

/**
 * Initiate a purchase flow for the given product.
 */
export async function purchase(productId: string): Promise<EntitlementState> {
  const plugin = getPlugin();
  if (!plugin) {
    return {
      ...DEFAULT_STATE,
      error: { code: 'NOT_NATIVE', message: 'Purchases are only available on iOS.' },
    };
  }

  try {
    await plugin.purchase({ productId });
    // After purchase, refresh entitlements
    return await refreshEntitlements();
  } catch (err: any) {
    const isCancelled = err?.code === 'USER_CANCELLED' || err?.message?.includes('cancel');
    if (isCancelled) {
      return { ...(readCache() || DEFAULT_STATE), error: null };
    }
    return {
      ...(readCache() || DEFAULT_STATE),
      error: { code: err?.code || 'PURCHASE_FAILED', message: err?.message || 'Purchase failed. Please try again.' },
    };
  }
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases(): Promise<EntitlementState> {
  const plugin = getPlugin();
  if (!plugin) {
    return {
      ...DEFAULT_STATE,
      error: { code: 'NOT_NATIVE', message: 'Restore is only available on iOS.' },
    };
  }

  try {
    await plugin.restorePurchases();
    return await refreshEntitlements();
  } catch (err: any) {
    return {
      ...(readCache() || DEFAULT_STATE),
      error: { code: 'RESTORE_FAILED', message: err?.message || 'Could not restore purchases.' },
    };
  }
}

/**
 * Get current entitlement state from cache (synchronous).
 */
export function getEntitlementState(): EntitlementState {
  const cached = readCache();
  if (cached) return { ...cached, source: 'cached' };
  return { ...DEFAULT_STATE };
}
