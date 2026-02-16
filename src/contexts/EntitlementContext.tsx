import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { checkSubscription, redirectToCheckout, openCustomerPortal, type SubscriptionStatus } from '@/lib/stripe/stripeService';

interface EntitlementState {
  isPro: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
  isActive: boolean;
  expiresAt: string | null;
}

interface EntitlementContextType {
  entitlementState: EntitlementState;
  loading: boolean;
  canWrite: boolean;
  startCheckout: () => Promise<void>;
  manageSubscription: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_STATE: EntitlementState = {
  isPro: false,
  isTrial: false,
  trialEndsAt: null,
  isActive: false,
  expiresAt: null,
};

const EntitlementContext = createContext<EntitlementContextType | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { isReviewer, user } = useAuth();
  const [state, setState] = useState<EntitlementState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result: SubscriptionStatus = await checkSubscription();
      if (!mountedRef.current) return;

      const isPro = result.subscribed && !result.isTrial;
      const isTrial = result.isTrial;

      setState({
        isPro,
        isTrial,
        trialEndsAt: result.trialEnd,
        isActive: result.subscribed,
        expiresAt: result.subscriptionEnd,
      });
    } catch (err) {
      console.warn('[Entitlement] refresh failed:', err);
      // Keep existing state
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      (async () => {
        await refresh();
        if (mountedRef.current) setLoading(false);
      })();
    } else {
      setLoading(false);
    }
    return () => { mountedRef.current = false; };
  }, [refresh, user]);

  // Refresh when app returns to foreground
  useEffect(() => {
    if (!user) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh, user]);

  // Periodic refresh every 60s
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh, user]);

  const startCheckout = useCallback(async () => {
    setLoading(true);
    try {
      await redirectToCheckout();
    } catch (err) {
      console.error('[Entitlement] checkout failed:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const manageSubscription = useCallback(async () => {
    try {
      await openCustomerPortal();
    } catch (err) {
      console.error('[Entitlement] portal failed:', err);
    }
  }, []);

  const canWrite = isReviewer || state.isPro || state.isTrial;

  return (
    <EntitlementContext.Provider value={{ entitlementState: state, loading, canWrite, startCheckout, manageSubscription, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within EntitlementProvider');
  return ctx;
}
