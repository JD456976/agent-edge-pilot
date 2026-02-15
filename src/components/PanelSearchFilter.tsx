import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

const PANEL_LABELS: Record<PanelId, string> = {
  'autopilot': 'Autopilot',
  'prepared-actions': 'Prepared Actions',
  'execution-queue': 'Execution Queue',
  'money-at-risk': 'Money at Risk',
  'opportunity-heat': 'Opportunity Heat',
  'income-forecast': 'Income Forecast',
  'stability-score': 'Stability Score',
  'income-volatility': 'Income Volatility',
  'pipeline-fragility': 'Pipeline Fragility',
  'lead-decay': 'Lead Decay',
  'operational-load': 'Operational Load',
  'deal-failure': 'Deal Failure',
  'ghosting-risk': 'Ghosting Risk',
  'referral-conversion': 'Referral Conversion',
  'listing-performance': 'Listing Performance',
  'time-allocation': 'Time Allocation',
  'opportunity-radar': 'Opportunity Radar',
  'income-protection': 'Income Protection',
  'market-conditions': 'Market Conditions',
  'learning-transparency': 'Learning Transparency',
  'network-benchmarks': 'Network Benchmarks',
  'weekly-review': 'Weekly Review',
  'agent-profile': 'Agent Profile',
  'income-patterns': 'Income Patterns',
  'market-signals': 'Market Signals',
  'end-of-day': 'End of Day',
};

interface PanelSearchFilterProps {
  onFilterChange: (filter: string) => void;
}

export function PanelSearchFilter({ onFilterChange }: PanelSearchFilterProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    onFilterChange(query);
  }, [query, onFilterChange]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter panels..."
        className="h-8 pl-8 pr-8 text-xs w-[160px]"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export function matchesPanelFilter(panelId: PanelId, filter: string): boolean {
  if (!filter.trim()) return true;
  const label = PANEL_LABELS[panelId] || panelId;
  return label.toLowerCase().includes(filter.toLowerCase());
}

export { PANEL_LABELS };
