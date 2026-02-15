/**
 * Subscription product identifiers and entitlement names.
 * These must match App Store Connect configuration.
 */

/** StoreKit product ID for Deal Pilot Pro monthly subscription */
export const DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID = 'com.dealpilot.pro.monthly';

/** Entitlement identifier for Pro access */
export const ENTITLEMENT_PRO = 'pro';

/** Trial duration in days (Apple-managed, used only for display) */
export const TRIAL_DURATION_DAYS = 14;

/** Price display string */
export const PRICE_DISPLAY = '$39/month';

/** Cached entitlement key in localStorage */
export const ENTITLEMENT_CACHE_KEY = 'dp_entitlement_state';

/** Max age for cached entitlement before requiring refresh (24h) */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
