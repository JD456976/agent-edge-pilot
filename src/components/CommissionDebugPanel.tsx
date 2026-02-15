import { useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { CommissionResolution } from '@/lib/commissionResolver';

interface Props {
  resolution: CommissionResolution;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString()}`;
}

/**
 * Dev-only debug panel showing full commission resolution breakdown.
 * Hidden in production builds.
 */
export function CommissionDebugPanel({ resolution }: Props) {
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-3 border border-dashed border-border rounded-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>🔧 Commission Resolution Debug</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 font-mono text-[10px]">
          {/* Calculation steps */}
          <div className="space-y-1">
            <p className="text-muted-foreground uppercase tracking-wider font-semibold">Calculation Steps</p>
            {resolution.calculationDetails.map((step, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {i + 1}. {step.label}
                  {step.note && <span className="ml-1 opacity-60">({step.note})</span>}
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(step.value)}</span>
              </div>
            ))}
          </div>

          {/* Confidence */}
          <div className="flex items-center justify-between border-t border-border pt-1.5">
            <span className="text-muted-foreground">Confidence</span>
            <span className={`font-medium ${
              resolution.confidence === 'HIGH' ? 'text-foreground' :
              resolution.confidence === 'MEDIUM' ? 'text-warning' :
              'text-urgent'
            }`}>
              {resolution.confidence}
            </span>
          </div>

          {/* Warnings */}
          {resolution.warnings.length > 0 && (
            <div className="space-y-0.5 border-t border-border pt-1.5">
              <p className="text-muted-foreground uppercase tracking-wider font-semibold">Warnings</p>
              {resolution.warnings.map((w, i) => (
                <p key={i} className="text-warning">⚠ {w}</p>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-xs">
            <span className="font-semibold">Resolved Personal Commission</span>
            <span className="font-bold text-foreground">{formatCurrency(resolution.personalCommissionTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
