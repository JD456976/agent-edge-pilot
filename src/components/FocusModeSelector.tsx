import { Focus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type FocusMode = 'tactical' | 'strategic' | 'minimal';

const FOCUS_MODES: Record<FocusMode, { label: string; description: string }> = {
  tactical: { label: 'Tactical', description: 'Execution panels — actions and risk' },
  strategic: { label: 'Strategic', description: 'Planning panels — forecast and stability' },
  minimal: { label: 'Minimal', description: 'Only essentials — briefing and risk' },
};

interface Props {
  mode: FocusMode;
  onModeChange: (mode: FocusMode) => void;
}

export function FocusModeSelector({ mode, onModeChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Focus className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={mode} onValueChange={(v) => onModeChange(v as FocusMode)}>
        <SelectTrigger className="h-8 w-[130px] text-xs border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(FOCUS_MODES) as [FocusMode, typeof FOCUS_MODES[FocusMode]][]).map(([key, config]) => (
            <SelectItem key={key} value={key} className="text-xs">
              <div>
                <span className="font-medium">{config.label}</span>
                <span className="text-muted-foreground ml-1.5">— {config.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Panel visibility rules per focus mode
import type { PanelId } from '@/hooks/usePanelLayout';

const TACTICAL_PANELS: Set<PanelId> = new Set([
  'autopilot', 'prepared-actions', 'execution-queue',
  'money-at-risk', 'opportunity-heat',
  'deal-failure', 'ghosting-risk',
  'time-allocation', 'opportunity-radar',
  'income-protection',
]);

const STRATEGIC_PANELS: Set<PanelId> = new Set([
  'income-forecast', 'stability-score',
  'income-volatility', 'pipeline-fragility',
  'lead-decay', 'operational-load',
  'referral-conversion', 'listing-performance',
  'market-conditions', 'network-benchmarks',
  'weekly-review', 'learning-transparency',
  'agent-profile', 'income-patterns',
]);

const MINIMAL_PANELS: Set<PanelId> = new Set([
  'autopilot', 'money-at-risk',
]);

export function isPanelVisibleInMode(panelId: PanelId, focusMode: FocusMode): boolean {
  switch (focusMode) {
    case 'tactical': return TACTICAL_PANELS.has(panelId);
    case 'strategic': return STRATEGIC_PANELS.has(panelId);
    case 'minimal': return MINIMAL_PANELS.has(panelId);
    default: return true;
  }
}
