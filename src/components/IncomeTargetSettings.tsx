import { useState } from 'react';
import { Target, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { StrategicSettings } from '@/lib/strategicEngine';

interface Props {
  settings: StrategicSettings;
  onUpdate: (patch: Partial<StrategicSettings>) => void;
  onReset: () => void;
}

export function IncomeTargetSettings({ settings, onUpdate, onReset }: Props) {
  const [localWeekly, setLocalWeekly] = useState(String(settings.weeklyTarget));
  const [localMonthly, setLocalMonthly] = useState(String(settings.monthlyTarget));
  const [localPipeline, setLocalPipeline] = useState(String(settings.comfortPipelineSize));

  const commitWeekly = () => {
    const v = Math.max(0, Number(localWeekly) || 0);
    setLocalWeekly(String(v));
    onUpdate({ weeklyTarget: v });
  };

  const commitMonthly = () => {
    const v = Math.max(0, Number(localMonthly) || 0);
    setLocalMonthly(String(v));
    onUpdate({ monthlyTarget: v });
  };

  const commitPipeline = () => {
    const v = Math.max(1, Math.round(Number(localPipeline) || 1));
    setLocalPipeline(String(v));
    onUpdate({ comfortPipelineSize: v });
  };

  const mix = settings.preferredDealMix;

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Target className="h-4 w-4" /> Strategic Targets
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Set your income goals and pipeline preferences. Used for gap analysis and strategy recommendations.
      </p>

      <div className="space-y-4">
        {/* Income Targets */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Weekly Target ($)</Label>
            <Input
              type="number"
              value={localWeekly}
              onChange={e => setLocalWeekly(e.target.value)}
              onBlur={commitWeekly}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Monthly Target ($)</Label>
            <Input
              type="number"
              value={localMonthly}
              onChange={e => setLocalMonthly(e.target.value)}
              onBlur={commitMonthly}
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>

        {/* Pipeline Size */}
        <div>
          <Label className="text-xs text-muted-foreground">Comfort Pipeline Size (active deals)</Label>
          <Input
            type="number"
            value={localPipeline}
            onChange={e => setLocalPipeline(e.target.value)}
            onBlur={commitPipeline}
            className="mt-1 h-8 text-sm w-24"
            min={1}
          />
        </div>

        {/* Deal Mix */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Preferred Deal Mix (%)</Label>
          {(['buyers', 'sellers', 'listings', 'investors'] as const).map(key => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs capitalize w-16">{key}</span>
              <Slider
                value={[mix[key]]}
                onValueChange={([v]) => onUpdate({
                  preferredDealMix: { ...mix, [key]: v },
                })}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right">{mix[key]}%</span>
            </div>
          ))}
        </div>
      </div>

      <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={onReset}>
        <RotateCcw className="h-3 w-3 mr-1" /> Reset to Defaults
      </Button>
    </section>
  );
}
