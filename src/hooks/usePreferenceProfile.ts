import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { computePreferences, type PreferenceResult } from '@/lib/preferenceEngine';
import type { FubActivity, FubPersonProfile } from '@/lib/intelAnalyzer';

interface UsePreferenceProfileOptions {
  entityId: string;
  entityType: 'lead' | 'deal';
  entity: any;
  fubActivities: FubActivity[];
  personProfile: FubPersonProfile | null;
}

export function usePreferenceProfile({
  entityId,
  entityType,
  entity,
  fubActivities,
  personProfile,
}: UsePreferenceProfileOptions) {
  const { user } = useAuth();
  const [result, setResult] = useState<PreferenceResult | null>(null);
  const [savedProfile, setSavedProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load saved profile + feedback
  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('preference_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('entity_id', entityId)
      .maybeSingle();
    setSavedProfile(data);
    return data;
  }, [user, entityId]);

  // Compute preferences
  const compute = useCallback(async (forceRecompute = false) => {
    if (!user) return;
    setLoading(true);

    const saved = await loadSaved();
    const overrides = (saved?.overrides as Record<string, any>) || {};

    // If we have a recent saved profile and not forcing, use it
    if (saved && !forceRecompute) {
      const lastComputed = new Date(saved.last_computed_at);
      const minutesSince = (Date.now() - lastComputed.getTime()) / 60000;
      if (minutesSince < 10) {
        setResult({
          profile: saved.profile as any,
          confidence: saved.confidence as number,
          reasons: saved.reasons as any,
        });
        setLoading(false);
        return;
      }
    }

    const computed = computePreferences(personProfile, fubActivities, entity, overrides);
    setResult(computed);

    // Persist to DB
    const row = {
      user_id: user.id,
      entity_id: entityId,
      entity_type: entityType,
      profile: computed.profile as any,
      confidence: computed.confidence,
      reasons: computed.reasons as any,
      overrides: overrides as any,
      last_computed_at: new Date().toISOString(),
      version: (saved?.version || 0) + 1,
    };

    await supabase
      .from('preference_profiles')
      .upsert(row, { onConflict: 'user_id,entity_id' });

    setLoading(false);
  }, [user, entityId, entityType, entity, fubActivities, personProfile, loadSaved]);

  // Submit feedback (confirm/reject/edit)
  const submitFeedback = useCallback(async (
    field: string,
    value: any,
    action: 'confirm' | 'reject' | 'edit',
  ) => {
    if (!user) return;
    setSaving(true);

    // Save feedback record
    await supabase.from('preference_feedback').insert({
      user_id: user.id,
      entity_id: entityId,
      field,
      value: value as any,
      action,
    });

    // Update overrides in preference_profiles
    const currentOverrides = (savedProfile?.overrides as Record<string, any>) || {};
    const newOverrides = { ...currentOverrides };

    if (field === 'town') {
      if (!newOverrides.towns) newOverrides.towns = [];
      newOverrides.towns = newOverrides.towns.filter((t: any) => t.name !== value.name);
      newOverrides.towns.push({ name: value.name, action });
    } else if (field === 'price_min' || field === 'price_max') {
      newOverrides[field] = value;
    } else if (field === 'property_type') {
      newOverrides.property_type = action === 'reject' ? null : value;
    } else if (field === 'must_have') {
      if (!newOverrides.must_haves) newOverrides.must_haves = [];
      if (action === 'reject') {
        newOverrides.must_haves = newOverrides.must_haves.filter((m: string) => m !== value);
      } else {
        if (!newOverrides.must_haves.includes(value)) newOverrides.must_haves.push(value);
      }
    }

    await supabase
      .from('preference_profiles')
      .update({ overrides: newOverrides as any })
      .eq('user_id', user.id)
      .eq('entity_id', entityId);

    // Recompute with new overrides
    setSaving(false);
    await compute(true);
  }, [user, entityId, savedProfile, compute]);

  // Initial load
  useEffect(() => {
    compute();
  }, [entityId, fubActivities.length, personProfile?.tags?.length]);

  return {
    result,
    loading,
    saving,
    recompute: () => compute(true),
    submitFeedback,
  };
}
