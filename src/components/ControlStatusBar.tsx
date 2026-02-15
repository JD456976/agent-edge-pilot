import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ControlStatus, ProgressItem } from '@/lib/dailyIntelligence';
import { checkStableFilter } from '@/lib/noiseGovernor';
import { NoiseSuppressionHint } from '@/components/NoiseSuppressionHint';

interface Props {
  controlStatus: ControlStatus;
  progressItems: ProgressItem[];
  showStressReduction: boolean;
  stressReductionDismissed: boolean;
  onDismissStressReduction: () => void;
}

const statusConfig: Record<ControlStatus, { label: string; className: string }> = {
  Stabilizing: { label: 'Stabilizing', className: 'text-foreground' },
  Holding: { label: 'Holding', className: 'text-muted-foreground' },
  'Needs Attention': { label: 'Needs Attention', className: 'text-foreground' },
};

export function ControlStatusBar({
  controlStatus,
  progressItems,
  showStressReduction,
  stressReductionDismissed,
  onDismissStressReduction,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[controlStatus];

  const stableFilter = useMemo(() => checkStableFilter(controlStatus), [controlStatus]);

  // Hide entirely when stable for N consecutive days
  if (stableFilter.hidden) return null;

  return (
    <div className="space-y-2">
      {/* Control Status */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Control Status: <span className={`font-medium ${config.className}`}>{config.label}</span>
        </span>

        {progressItems.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Since your last session
          </button>
        )}
      </div>

      {/* Progress Snapshot (expandable) */}
      {expanded && progressItems.length > 0 && (
        <ul className="space-y-1 pl-1">
          {progressItems.map(item => (
            <li key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="status-dot bg-primary mt-1 shrink-0" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Stress Reduction Signal */}
      {showStressReduction && !stressReductionDismissed && (
        <p className="text-xs text-muted-foreground">
          Urgent threats reduced.
        </p>
      )}
    </div>
  );
}
