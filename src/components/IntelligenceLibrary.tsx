import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { LazyPanel } from '@/components/LazyPanel';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

type GroupKey = 'pipeline' | 'deals' | 'prospecting' | 'strategy';

interface GroupConfig {
  key: GroupKey;
  label: string;
  panels: PanelId[];
}

const GROUPS: GroupConfig[] = [
  {
    key: 'pipeline',
    label: 'Pipeline & Income',
    panels: ['income-forecast', 'stability-score', 'income-volatility', 'income-patterns', 'income-protection'],
  },
  {
    key: 'deals',
    label: 'Deal Health',
    panels: ['deal-failure', 'pipeline-fragility', 'ghosting-risk', 'listing-performance'],
  },
  {
    key: 'prospecting',
    label: 'Prospecting',
    panels: ['lead-decay', 'opportunity-radar', 'referral-conversion'],
  },
  {
    key: 'strategy',
    label: 'Strategy & Tools',
    panels: [
      'market-conditions', 'market-signals', 'weekly-review', 'operational-load',
      'time-allocation', 'network-benchmarks', 'learning-transparency', 'agent-profile',
      'execution-queue', 'prepared-actions', 'end-of-day',
    ],
  },
];

// Panels handled in Action Zone — never show in library
const ACTION_ZONE_PANELS = new Set<PanelId>(['autopilot', 'money-at-risk', 'opportunity-heat']);

const STORAGE_KEY = 'dp-library-groups-v1';

function loadGroupState(): Record<GroupKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { pipeline: false, deals: false, prospecting: false, strategy: false };
}

function saveGroupState(state: Record<GroupKey, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

interface Props {
  renderPanel: (panelId: PanelId) => React.ReactNode;
  isPanelVisible?: (panelId: PanelId) => boolean;
}

export function IntelligenceLibrary({ renderPanel, isPanelVisible }: Props) {
  const [expanded, setExpanded] = useState<Record<GroupKey, boolean>>(loadGroupState);

  const toggle = useCallback((key: GroupKey) => {
    setExpanded(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveGroupState(next);
      return next;
    });
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-2 pb-1">
        <Library className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground">Intelligence Library</h2>
      </div>

      {GROUPS.map(group => {
        const visiblePanels = group.panels.filter(
          id => !ACTION_ZONE_PANELS.has(id) && (!isPanelVisible || isPanelVisible(id))
        );
        if (visiblePanels.length === 0) return null;
        const isOpen = expanded[group.key];

        return (
          <div key={group.key} className="rounded-lg border border-border bg-card/50">
            <button
              onClick={() => toggle(group.key)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-xs text-muted-foreground">({visiblePanels.length})</span>
              </div>
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-3">
                {visiblePanels.map(panelId => {
                  const content = renderPanel(panelId);
                  if (!content) return null;
                  return (
                    <PanelErrorBoundary key={panelId}>
                      <LazyPanel skeletonLines={3}>
                        {content}
                      </LazyPanel>
                    </PanelErrorBoundary>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
