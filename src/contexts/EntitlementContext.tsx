import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  type EntitlementState,
  refreshEntitlements,
  purchase as purchaseProduct,
  restorePurchases as restoreProducts,
  getEntitlementState,
} from '@/lib/subscription/subscriptionService';
import { DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID } from '@/lib/subscription/products';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface EntitlementContextType {
  entitlementState: EntitlementState;
  loading: boolean;
  /** Whether the user can perform write actions (Pro, trial, or reviewer) */
  canWrite: boolean;
  purchasePro: () => Promise<void>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextType | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { isReviewer } = useAuth();
  const [state, setState] = useState<EntitlementState>(getEntitlementState());
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const checkServerGrant = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return false;
      const { data } = await supabase
        .from('user_entitlements')
        .select('is_pro, expires_at')
        .eq('user_id', authUser.id)
        .eq('is_pro', true)
        .maybeSingle();
      if (!data) return false;
      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const updated = await refreshEntitlements();
      // Also check server-side admin grants
      const serverGrant = await checkServerGrant();
      if (serverGrant) {
        updated.isPro = true;
        updated.isActive = true;
      }
      if (mountedRef.current) setState(updated);
    } catch {
      // Keep existing state
    }
  }, [checkServerGrant]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      await refresh();
      if (mountedRef.current) setLoading(false);
    })();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  // Refresh when app returns to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const purchasePro = useCallback(async () => {
    setLoading(true);
    const result = await purchaseProduct(DEAL_PILOT_PRO_MONTHLY_PRODUCT_ID);
    if (mountedRef.current) {
      setState(result);
      setLoading(false);
    }
  }, []);

  const restore = useCallback(async () => {
    setLoading(true);
    const result = await restoreProducts();
    if (mountedRef.current) {
      setState(result);
      setLoading(false);
    }
  }, []);

  const canWrite = isReviewer || state.isPro || state.isTrial;

  return (
    <EntitlementContext.Provider value={{ entitlementState: state, loading, canWrite, purchasePro, restore, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within EntitlementProvider');
  return ctx;
}
