import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ScoringPreferences {
  // Deal risk
  inactivity_3d_points: number;
  inactivity_7d_points: number;
  closing_7d_points: number;
  closing_3d_points: number;
  milestone_points: number;
  drift_conflict_points: number;
  // Lead opportunity
  lead_hot_points: number;
  lead_warm_points: number;
  lead_new_48h_points: number;
  engagement_points: number;
  gap_2d_points: number;
  gap_5d_points: number;
  drift_new_lead_points: number;
}

export const DEFAULT_SCORING: ScoringPreferences = {
  inactivity_3d_points: 20,
  inactivity_7d_points: 40,
  closing_7d_points: 20,
  closing_3d_points: 30,
  milestone_points: 20,
  drift_conflict_points: 30,
  lead_hot_points: 30,
  lead_warm_points: 15,
  lead_new_48h_points: 20,
  engagement_points: 15,
  gap_2d_points: 15,
  gap_5d_points: 25,
  drift_new_lead_points: 20,
};

export function useScoringPreferences(userId?: string) {
  const [prefs, setPrefs] = useState<ScoringPreferences>(DEFAULT_SCORING);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('scoring_preferences' as any)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            inactivity_3d_points: (data as any).inactivity_3d_points ?? DEFAULT_SCORING.inactivity_3d_points,
            inactivity_7d_points: (data as any).inactivity_7d_points ?? DEFAULT_SCORING.inactivity_7d_points,
            closing_7d_points: (data as any).closing_7d_points ?? DEFAULT_SCORING.closing_7d_points,
            closing_3d_points: (data as any).closing_3d_points ?? DEFAULT_SCORING.closing_3d_points,
            milestone_points: (data as any).milestone_points ?? DEFAULT_SCORING.milestone_points,
            drift_conflict_points: (data as any).drift_conflict_points ?? DEFAULT_SCORING.drift_conflict_points,
            lead_hot_points: (data as any).lead_hot_points ?? DEFAULT_SCORING.lead_hot_points,
            lead_warm_points: (data as any).lead_warm_points ?? DEFAULT_SCORING.lead_warm_points,
            lead_new_48h_points: (data as any).lead_new_48h_points ?? DEFAULT_SCORING.lead_new_48h_points,
            engagement_points: (data as any).engagement_points ?? DEFAULT_SCORING.engagement_points,
            gap_2d_points: (data as any).gap_2d_points ?? DEFAULT_SCORING.gap_2d_points,
            gap_5d_points: (data as any).gap_5d_points ?? DEFAULT_SCORING.gap_5d_points,
            drift_new_lead_points: (data as any).drift_new_lead_points ?? DEFAULT_SCORING.drift_new_lead_points,
          });
        }
        setLoaded(true);
      });
  }, [userId]);

  const savePrefs = async (newPrefs: ScoringPreferences) => {
    if (!userId) return;
    setPrefs(newPrefs);
    await supabase.from('scoring_preferences' as any).upsert({
      user_id: userId,
      ...newPrefs,
      updated_at: new Date().toISOString(),
    } as any);
  };

  return { prefs, loaded, savePrefs };
}
