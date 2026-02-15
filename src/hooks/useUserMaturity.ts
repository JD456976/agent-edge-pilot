import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';

export type UserLevel = 0 | 1 | 2 | 3;

export interface UserMaturity {
  level: UserLevel;
  label: string;
  description: string;
  daysSinceOnboarding: number;
  dealCount: number;
  leadCount: number;
  completedTaskCount: number;
  touchCount: number;
}

export function useUserMaturity(): UserMaturity {
  const { deals, leads, tasks } = useData();
  const { user, onboardingCompleted } = useAuth();

  return useMemo(() => {
    const dealCount = deals.length;
    const leadCount = leads.length;
    const completedTaskCount = tasks.filter(t => t.completedAt).length;
    const touchCount = tasks.filter(t => t.completedAt && (t.type === 'call' || t.type === 'text' || t.type === 'email')).length;

    // Days since account creation
    const createdAt = user?.createdAt ? new Date(user.createdAt) : new Date();
    const daysSinceOnboarding = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Level 3 — Power User
    if (
      dealCount > 15 &&
      leadCount > 30 &&
      daysSinceOnboarding > 30 &&
      completedTaskCount > 20 &&
      touchCount >= 10
    ) {
      return {
        level: 3,
        label: 'Power User',
        description: 'Full access to all panels and insights.',
        daysSinceOnboarding, dealCount, leadCount, completedTaskCount, touchCount,
      };
    }

    // Level 2 — Established
    if (
      dealCount > 15 &&
      leadCount > 30 &&
      daysSinceOnboarding > 30 &&
      completedTaskCount > 0
    ) {
      return {
        level: 2,
        label: 'Established',
        description: 'Strategic and execution panels unlocked.',
        daysSinceOnboarding, dealCount, leadCount, completedTaskCount, touchCount,
      };
    }

    // Level 1 — Early Adoption
    if (
      (dealCount >= 5 || leadCount >= 10 || daysSinceOnboarding >= 7)
    ) {
      return {
        level: 1,
        label: 'Early Adoption',
        description: 'Opportunity and stability insights unlocked.',
        daysSinceOnboarding, dealCount, leadCount, completedTaskCount, touchCount,
      };
    }

    // Level 0 — New User / Low Data
    return {
      level: 0,
      label: 'New User',
      description: 'Starting with essential panels only.',
      daysSinceOnboarding, dealCount, leadCount, completedTaskCount, touchCount,
    };
  }, [deals, leads, tasks, user?.createdAt]);
}
