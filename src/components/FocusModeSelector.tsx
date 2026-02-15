import { Focus, Briefcase, Users, ClipboardList, Layers } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type FocusMode = 'tactical' | 'strategic' | 'minimal' | 'deals' | 'leads' | 'tasks';

const FOCUS_MODES: Record<FocusMode, { label: string; description: string; icon: React.ElementType }> = {
  tactical: { label: 'Tactical', description: 'Execution — actions and risk', icon: Focus },
  strategic: { label: 'Strategic', description: 'Planning — forecast and stability', icon: Layers },
  minimal: { label: 'Minimal', description: 'Only essentials', icon: Focus },
  deals: { label: 'Deals Only', description: 'Deal-focused panels', icon: Briefcase },
  leads: { label: 'Leads Only', description: 'Lead-focused panels', icon: Users },
  tasks: { label: 'Tasks Only', description: 'Task and action panels', icon: ClipboardList },
};

interface Props {
  mode: FocusMode;
  onModeChange: (mode: FocusMode) => void;
}

export function FocusModeSelector({ mode, onModeChange }: Props) {
  const Icon = FOCUS_MODES[mode]?.icon || Focus;
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={mode} onValueChange={(v) => onModeChange(v as FocusMode)}>
        <SelectTrigger className="h-8 w-[140px] text-xs border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">View Mode</div>
          {(['tactical', 'strategic', 'minimal'] as FocusMode[]).map(key => {
            const config = FOCUS_MODES[key];
            return (
              <SelectItem key={key} value={key} className="text-xs">
                <span className="font-medium">{config.label}</span>
                <span className="text-muted-foreground ml-1.5 hidden sm:inline">— {config.description}</span>
              </SelectItem>
            );
          })}
          <div className="px-2 py-1 mt-1 border-t border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Entity Filter</div>
          {(['deals', 'leads', 'tasks'] as FocusMode[]).map(key => {
            const config = FOCUS_MODES[key];
            return (
              <SelectItem key={key} value={key} className="text-xs">
                <span className="font-medium">{config.label}</span>
                <span className="text-muted-foreground ml-1.5 hidden sm:inline">— {config.description}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// Panel visibility rules per focus mode
import type { PanelId } from '@/hooks/useCommandCenterLayout';

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
  'market-signals',
]);

const MINIMAL_PANELS: Set<PanelId> = new Set([
  'autopilot', 'money-at-risk',
]);

const DEALS_PANELS: Set<PanelId> = new Set([
  'money-at-risk', 'deal-failure', 'income-forecast',
  'income-protection', 'pipeline-fragility',
  'listing-performance', 'income-volatility',
  'prepared-actions', 'execution-queue',
]);

const LEADS_PANELS: Set<PanelId> = new Set([
  'opportunity-heat', 'opportunity-radar', 'lead-decay',
  'ghosting-risk', 'referral-conversion',
  'prepared-actions', 'execution-queue',
]);

const TASKS_PANELS: Set<PanelId> = new Set([
  'autopilot', 'prepared-actions', 'execution-queue',
  'time-allocation', 'operational-load',
  'end-of-day',
]);

export function isPanelVisibleInMode(panelId: PanelId, focusMode: FocusMode): boolean {
  switch (focusMode) {
    case 'tactical': return TACTICAL_PANELS.has(panelId);
    case 'strategic': return STRATEGIC_PANELS.has(panelId);
    case 'minimal': return MINIMAL_PANELS.has(panelId);
    case 'deals': return DEALS_PANELS.has(panelId);
    case 'leads': return LEADS_PANELS.has(panelId);
    case 'tasks': return TASKS_PANELS.has(panelId);
    default: return true;
  }
}
