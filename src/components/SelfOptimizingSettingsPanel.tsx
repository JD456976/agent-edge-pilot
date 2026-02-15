import { useState, useCallback } from 'react';
import { Brain, Download, RotateCcw, Lightbulb, Clock, MessageSquare, BarChart3, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SelfOptPreferences, SelfOptAnalysis, PersonalPattern } from '@/lib/selfOptimizingEngine';

interface Props {
  prefs: SelfOptPreferences;
  analysis: SelfOptAnalysis;
  onUpdatePrefs: (updates: Partial<SelfOptPreferences>) => void;
  onReset: () => void;
  onExport: () => string;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH: 'text-opportunity',
  MEDIUM: 'text-warning',
  LOW: 'text-muted-foreground',
};

const CATEGORY_ICON: Record<string, typeof Clock> = {
  time: Clock,
  channel: MessageSquare,
  action: Lightbulb,
  behavior: BarChart3,
};

export function SelfOptimizingSettingsPanel({ prefs, analysis, onUpdatePrefs, onReset, onExport }: Props) {
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');

  const handleExport = useCallback(() => {
    const json = onExport();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deal-pilot-learning-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [onExport]);

  const handleReset = useCallback(() => {
    if (resetConfirm === 'RESET') {
      onReset();
      setShowReset(false);
      setResetConfirm('');
    }
  }, [resetConfirm, onReset]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Brain className="h-4 w-4" /> Self-Optimizing Mode
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Learns which actions and patterns produce the best outcomes for you.
      </p>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Label className="text-sm">Enable Self-Optimizing</Label>
          <p className="text-xs text-muted-foreground">Allow Deal Pilot to learn from your actions.</p>
        </div>
        <button
          onClick={() => onUpdatePrefs({ enabled: !prefs.enabled })}
          className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors"
        >
          <span className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-primary transition-transform',
            prefs.enabled ? 'translate-x-6' : 'translate-x-1'
          )} />
        </button>
      </div>

      {prefs.enabled && (
        <div className="space-y-4 pt-3 border-t border-border">
          {/* Nudge Level */}
          <div>
            <Label className="text-xs text-muted-foreground">Nudge Level</Label>
            <Select
              value={prefs.nudge_level}
              onValueChange={(v) => onUpdatePrefs({ nudge_level: v as SelfOptPreferences['nudge_level'] })}
            >
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal — 1 nudge max</SelectItem>
                <SelectItem value="balanced">Balanced — Up to 2 nudges</SelectItem>
                <SelectItem value="proactive">Proactive — Up to 3 nudges</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Coaching Tone */}
          <div>
            <Label className="text-xs text-muted-foreground">Default Communication Tone</Label>
            <Select
              value={prefs.coaching_tone}
              onValueChange={(v) => onUpdatePrefs({ coaching_tone: v as SelfOptPreferences['coaching_tone'] })}
            >
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optimization Toggles */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Optimization Controls</Label>
            {[
              { key: 'allow_time_of_day_optimization' as const, label: 'Time-of-day optimization', desc: 'Prioritize actions during your peak windows' },
              { key: 'allow_channel_optimization' as const, label: 'Channel optimization', desc: 'Default to your most effective communication channel' },
              { key: 'allow_priority_reweighting' as const, label: 'Priority adjustments', desc: 'Gently adjust ranking based on personal patterns (±10 points max)' },
            ].map(opt => (
              <div key={opt.key} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-xs font-medium">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
                <button
                  onClick={() => onUpdatePrefs({ [opt.key]: !prefs[opt.key] })}
                  className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted transition-colors shrink-0"
                >
                  <span className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-primary transition-transform',
                    prefs[opt.key] ? 'translate-x-4' : 'translate-x-1'
                  )} />
                </button>
              </div>
            ))}
          </div>

          {/* Learned Patterns */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Learned Patterns ({analysis.totalOutcomes} outcomes tracked)
            </p>
            {analysis.totalOutcomes < 3 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Info className="h-3.5 w-3.5" />
                Learning in progress. Complete more actions to see patterns.
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.patterns.slice(0, 3).map(pattern => {
                  const Icon = CATEGORY_ICON[pattern.category] || Lightbulb;
                  return (
                    <div key={pattern.id} className="flex items-start gap-2">
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-medium">{pattern.title}</p>
                        <p className="text-[10px] text-muted-foreground">{pattern.description}</p>
                        <span className={cn('text-[10px]', CONFIDENCE_STYLE[pattern.confidence])}>
                          {pattern.confidence} confidence · {pattern.sampleSize} events
                        </span>
                      </div>
                    </div>
                  );
                })}
                {analysis.patterns.length === 0 && analysis.totalOutcomes >= 3 && (
                  <p className="text-xs text-muted-foreground">No strong patterns detected yet. Keep using Deal Pilot.</p>
                )}
              </div>
            )}
          </div>

          {/* Export & Reset */}
          <div className="pt-3 border-t border-border space-y-2">
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Learning Summary (JSON)
            </Button>

            {!showReset ? (
              <button
                onClick={() => setShowReset(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset all learning data
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-md border border-urgent/20 bg-urgent/5">
                <p className="text-xs text-foreground">Type <span className="font-mono font-bold">RESET</span> to confirm clearing all learned patterns.</p>
                <Input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder="Type RESET"
                  className="text-xs h-8"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="text-xs h-7" onClick={handleReset} disabled={resetConfirm !== 'RESET'}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Confirm Reset
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setShowReset(false); setResetConfirm(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
