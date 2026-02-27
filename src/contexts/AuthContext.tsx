import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, UserRole } from '@/types';
import { generateDemoData } from '@/data/demo';
import { saveStrategicSettings, DEFAULT_STRATEGIC_SETTINGS } from '@/lib/strategicEngine';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profiles: User[];
  onboardingCompleted: boolean;
  isReviewer: boolean;
  isProtected: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  fetchProfiles: () => Promise<void>;
  setOnboardingCompleted: () => Promise<void>;
  logAdminAction: (action: string, metadata?: Record<string, unknown>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [onboardingCompleted, setOnboardingCompletedState] = useState(true);
  const [isReviewer, setIsReviewer] = useState(false);
  const [isProtected, setIsProtected] = useState(false);
  const reviewerSeeded = useRef(false);

  const loadUserData = useCallback(async (authUserId: string) => {
    try {
      const [{ data: profile }, { data: roleData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', authUserId).single(),
        supabase.from('user_roles').select('role').eq('user_id', authUserId).single(),
      ]);

      if (profile) {
        const role = (roleData?.role as UserRole) || 'agent';
        const profileStatus = (profile as any).status || 'active';
        const isDeleted = (profile as any).is_deleted || false;
        setUser({
          id: authUserId,
          name: profile.name,
          email: profile.email,
          role,
          themePreference: (profile.theme_preference as 'dark' | 'light') || 'dark',
          createdAt: profile.created_at,
          lastLoginAt: new Date().toISOString(),
          isActive: profileStatus === 'active' && !isDeleted,
        });
        setOnboardingCompletedState((profile as any).onboarding_completed ?? false);
        setIsReviewer(role === 'reviewer');
        setIsProtected((profile as any).is_protected ?? false);
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setTimeout(() => {
          if (mounted) loadUserData(session.user.id);
        }, 0);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && mounted) setLoading(false);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadUserData]);

  // Reviewer auto-seed: on first login, seed demo data silently and mark onboarding complete
  useEffect(() => {
    if (!user || !isReviewer || onboardingCompleted || reviewerSeeded.current) return;
    reviewerSeeded.current = true;
    (async () => {
      try {
        const demo = generateDemoData(user.id);
        await supabase.from('leads').insert(demo.leads);
        await supabase.from('deals').insert(demo.deals);
        await supabase.from('deal_participants').insert(demo.dealParticipants);
        await supabase.from('tasks').insert(demo.tasks);
        await supabase.from('alerts').insert(demo.alerts);
        if (demo.activityEvents && demo.activityEvents.length > 0) {
          await supabase.from('activity_events').insert(demo.activityEvents);
        }

        // Seed commission defaults so forecast panels show realistic numbers
        await supabase.from('commission_defaults').upsert({
          user_id: user.id,
          default_commission_rate: 3.0,
          default_split: 100,
          default_referral_fee: 0,
          typical_price_mid: 500000,
        }, { onConflict: 'user_id' });

        // Seed agent intelligence profile so Agent Profile panel is populated
        await supabase.from('agent_intelligence_profile').upsert({
          user_id: user.id,
          deal_close_rate_estimate: 0.72,
          lead_conversion_rate_estimate: 0.18,
          preferred_channel_call_pct: 45,
          preferred_channel_email_pct: 30,
          preferred_channel_text_pct: 25,
          avg_daily_actions: 8,
          active_days_last_30: 22,
          risk_tolerance: 'medium',
          income_trend: 'rising',
          stability_trend: 'stable',
          avg_response_time_bucket: '1-4h',
          avg_time_to_close_bucket: '30-45d',
          best_time_of_day_bucket: '9am-12pm',
        }, { onConflict: 'user_id' });

        // Set income target in localStorage so forecast panels show meaningful targets
        saveStrategicSettings({
          ...DEFAULT_STRATEGIC_SETTINGS,
          weeklyTarget: 8000,
          monthlyTarget: 32000,
        }, user.id);

        // Auto-grant pro access for reviewer accounts (replaces old entitlement bypass)
        await supabase.from('user_entitlements').upsert({
          user_id: user.id,
          is_pro: true,
          is_trial: false,
          source: 'admin_grant',
          expires_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('profiles').update({ onboarding_completed: true } as any).eq('user_id', user.id);
        setOnboardingCompletedState(true);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Reviewer auto-seed failed:', err);
      }
    })();
  }, [user, isReviewer, onboardingCompleted]);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signup = async (email: string, password: string, name: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) return { error: error.message };
    return {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const fetchProfiles = useCallback(async () => {
    const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
    ]);
    if (profilesData) {
      const roleMap = new Map<string, UserRole>();
      rolesData?.forEach(r => roleMap.set(r.user_id, r.role as UserRole));
      setProfiles(profilesData.map(p => ({
        id: p.user_id,
        name: p.name,
        email: p.email,
        role: roleMap.get(p.user_id) || 'agent',
        themePreference: (p.theme_preference as 'dark' | 'light') || 'dark',
        createdAt: p.created_at,
        lastLoginAt: '',
        isActive: true,
        isProtected: (p as any).is_protected ?? false,
      })));
    }
  }, []);

  const updateUserRole = async (userId: string, role: UserRole) => {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
    await logAdminAction('role_change', { targetUserId: userId, newRole: role });
    await fetchProfiles();
    if (userId === user?.id) {
      setUser(prev => prev ? { ...prev, role } : null);
    }
  };

  const setOnboardingCompleted = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase.from('profiles').update({ onboarding_completed: true } as any).eq('user_id', authUser.id);
      setOnboardingCompletedState(true);
    }
  };

  const logAdminAction = async (action: string, metadata?: Record<string, unknown>) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: authUser.id,
      action,
      metadata: metadata || {},
    });
  };

  return (
    <AuthContext.Provider value={{
      user, loading, profiles, onboardingCompleted, isReviewer, isProtected,
      login, signup, logout, updateUserRole, fetchProfiles,
      setOnboardingCompleted, logAdminAction,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
