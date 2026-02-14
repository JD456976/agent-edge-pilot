import React, { createContext, useContext, useState } from 'react';
import type { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  users: User[];
  login: (email: string, password: string) => boolean;
  logout: () => void;
  createUser: (name: string, email: string, role: UserRole) => User;
  deactivateUser: (id: string) => void;
}

const DEMO_USERS: User[] = [
  { id: 'demo-agent-1', name: 'Alex Morgan', email: 'alex@dealpilot.demo', role: 'agent', themePreference: 'dark', createdAt: '2025-12-01T00:00:00Z', lastLoginAt: new Date().toISOString(), isActive: true },
  { id: 'demo-admin-1', name: 'Jordan Taylor', email: 'admin@dealpilot.demo', role: 'admin', themePreference: 'dark', createdAt: '2025-11-01T00:00:00Z', lastLoginAt: new Date().toISOString(), isActive: true },
  { id: 'demo-reviewer-1', name: 'App Reviewer', email: 'reviewer@dealpilot.demo', role: 'reviewer', themePreference: 'dark', createdAt: '2026-01-15T00:00:00Z', lastLoginAt: new Date().toISOString(), isActive: true },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('dp-user');
    return stored ? JSON.parse(stored) : null;
  });
  const [users, setUsers] = useState<User[]>(() => {
    const stored = localStorage.getItem('dp-users');
    return stored ? JSON.parse(stored) : DEMO_USERS;
  });

  const saveUsers = (u: User[]) => { setUsers(u); localStorage.setItem('dp-users', JSON.stringify(u)); };

  const login = (email: string, _password: string): boolean => {
    const found = users.find(u => u.email === email && u.isActive);
    if (found) {
      const updated = { ...found, lastLoginAt: new Date().toISOString() };
      setUser(updated);
      localStorage.setItem('dp-user', JSON.stringify(updated));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('dp-user');
  };

  const createUser = (name: string, email: string, role: UserRole): User => {
    const newUser: User = {
      id: `user-${Date.now()}`,
      name, email, role,
      themePreference: 'dark',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      isActive: true,
    };
    const updated = [...users, newUser];
    saveUsers(updated);
    return newUser;
  };

  const deactivateUser = (id: string) => {
    saveUsers(users.map(u => u.id === id ? { ...u, isActive: false } : u));
  };

  return (
    <AuthContext.Provider value={{ user, users, login, logout, createUser, deactivateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
