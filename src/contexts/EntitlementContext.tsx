import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// ── Owner/admin emails — always have full access ──────────────────────────────
const OWNER_EMAILS = [
  'craig219@comcast.net',
  'jason.craig@chinattirealty.com',
  'jdog45@gmail.com',
];

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
  isPro: true,
  isTrial: false,
  trialEndsAt: null,
  isActive: true,
  expiresAt: null,
};

const EntitlementContext = createContext<EntitlementContextType | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const isOwner = !!user?.email && OWNER_EMAILS.some(e => e.toLowerCase() === user.email!.toLowerCase());
  const isAdmin = user?.role === 'admin';

  // All logged-in users can write for now.
  // When Stripe is ready, gate non-admin users here.
  const canWrite = !!user;

  const state: EntitlementState = {
    isPro: isOwner || isAdmin,
    isTrial: false,
    trialEndsAt: null,
    isActive: !!user,
    expiresAt: null,
  };

  const refresh = useCallback(async () => {
    // Stripe integration placeholder — no-op until billing is live
  }, []);

  const startCheckout = useCallback(async () => {
    console.log('[Entitlement] Stripe checkout not configured yet');
  }, []);

  const manageSubscription = useCallback(async () => {
    console.log('[Entitlement] Stripe portal not configured yet');
  }, []);

  return (
    <EntitlementContext.Provider value={{
      entitlementState: state,
      loading,
      canWrite,
      startCheckout,
      manageSubscription,
      refresh,
    }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within EntitlementProvider');
  return ctx;
}
