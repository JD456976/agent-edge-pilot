import { useState } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useScoringPreferences, DEFAULT_SCORING, type ScoringPreferences } from '@/hooks/useScoringPreferences';

interface SliderRowProps {
  label: string;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, defaultValue, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{value}pts</span>
          {value !== defaultValue && (
            <button onClick={() => onChange(defaultValue)} className="text-[10px] text-primary hover:text-primary/80">
              reset
            </button>
          )}
        </div>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={50}
        step={5}
        className="w-full"
      />
    </div>
  );
}

export function ScoringCalibrationPanel() {
  const { user } = useAuth();
  const { prefs, loaded, savePrefs } = useScoringPreferences(user?.id);
  const [local, setLocal] = useState<ScoringPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  const current = local ?? prefs;

  const update = (key: keyof ScoringPreferences, value: number) => {
    setLocal(prev => ({ ...(prev ?? prefs), [key]: value }));
  };

  const handleSave = async () => {
    if (!local) return;
    setSaving(true);
    await savePrefs(local);
    setSaving(false);
    setLocal(null);
    toast({ description: 'Scoring preferences saved.' });
  };

  const handleResetAll = () => {
    setLocal({ ...DEFAULT_SCORING });
  };

  if (!loaded) return null;

  const hasChanges = local !== null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Scoring Calibration
        </h2>
        <Button size="sm" variant="ghost" onClick={handleResetAll} className="text-xs h-7">
          <RotateCcw className="h-3 w-3 mr-1" /> Reset All
        </Button>
      </div>

      {/* Deal Risk */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Deal Risk</p>
        <div className="space-y-3">
          <SliderRow label="Inactivity > 3 days" value={current.inactivity_3d_points} defaultValue={DEFAULT_SCORING.inactivity_3d_points} onChange={v => update('inactivity_3d_points', v)} />
          <SliderRow label="Inactivity > 7 days" value={current.inactivity_7d_points} defaultValue={DEFAULT_SCORING.inactivity_7d_points} onChange={v => update('inactivity_7d_points', v)} />
          <SliderRow label="Closing within 7 days" value={current.closing_7d_points} defaultValue={DEFAULT_SCORING.closing_7d_points} onChange={v => update('closing_7d_points', v)} />
          <SliderRow label="Closing within 3 days" value={current.closing_3d_points} defaultValue={DEFAULT_SCORING.closing_3d_points} onChange={v => update('closing_3d_points', v)} />
          <SliderRow label="Milestone unresolved" value={current.milestone_points} defaultValue={DEFAULT_SCORING.milestone_points} onChange={v => update('milestone_points', v)} />
          <SliderRow label="Drift / conflict" value={current.drift_conflict_points} defaultValue={DEFAULT_SCORING.drift_conflict_points} onChange={v => update('drift_conflict_points', v)} />
        </div>
      </div>

      {/* Opportunity Heat */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Opportunity Heat</p>
        <div className="space-y-3">
          <SliderRow label="Hot lead" value={current.lead_hot_points} defaultValue={DEFAULT_SCORING.lead_hot_points} onChange={v => update('lead_hot_points', v)} />
          <SliderRow label="Warm lead" value={current.lead_warm_points} defaultValue={DEFAULT_SCORING.lead_warm_points} onChange={v => update('lead_warm_points', v)} />
          <SliderRow label="New lead (< 48h)" value={current.lead_new_48h_points} defaultValue={DEFAULT_SCORING.lead_new_48h_points} onChange={v => update('lead_new_48h_points', v)} />
          <SliderRow label="Engagement signals" value={current.engagement_points} defaultValue={DEFAULT_SCORING.engagement_points} onChange={v => update('engagement_points', v)} />
          <SliderRow label="No follow-up > 2 days" value={current.gap_2d_points} defaultValue={DEFAULT_SCORING.gap_2d_points} onChange={v => update('gap_2d_points', v)} />
          <SliderRow label="No follow-up > 5 days" value={current.gap_5d_points} defaultValue={DEFAULT_SCORING.gap_5d_points} onChange={v => update('gap_5d_points', v)} />
          <SliderRow label="Drift new lead" value={current.drift_new_lead_points} defaultValue={DEFAULT_SCORING.drift_new_lead_points} onChange={v => update('drift_new_lead_points', v)} />
        </div>
      </div>

      {hasChanges && (
        <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving…' : 'Save Preferences'}
        </Button>
      )}
    </section>
  );
}
