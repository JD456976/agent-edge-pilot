import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profiles: User[];
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  fetchProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<User[]>([]);

  const loadUserData = useCallback(async (authUserId: string) => {
    try {
      const [{ data: profile }, { data: roleData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', authUserId).single(),
        supabase.from('user_roles').select('role').eq('user_id', authUserId).single(),
      ]);

      if (profile) {
        setUser({
          id: authUserId,
          name: profile.name,
          email: profile.email,
          role: (roleData?.role as UserRole) || 'agent',
          themePreference: (profile.theme_preference as 'dark' | 'light') || 'dark',
          createdAt: profile.created_at,
          lastLoginAt: new Date().toISOString(),
          isActive: true,
        });
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
      })));
    }
  }, []);

  const updateUserRole = async (userId: string, role: UserRole) => {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
    await fetchProfiles();
    if (userId === user?.id) {
      setUser(prev => prev ? { ...prev, role } : null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, profiles, login, signup, logout, updateUserRole, fetchProfiles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
