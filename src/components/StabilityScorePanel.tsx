import { useMemo, useState } from 'react';
import { Activity, ChevronRight, X, Check, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { computeStabilityScore, type StabilityInputs, type StabilityResult } from '@/lib/stabilityModel';

interface Props {
  inputs: StabilityInputs;
  onCreateTask: (title: string) => void;
}

const BAND_STYLE: Record<string, { className: string; dotClass: string }> = {
  'Stable': { className: 'text-foreground', dotClass: 'bg-opportunity' },
  'Watch': { className: 'text-warning', dotClass: 'bg-warning' },
  'Needs Attention': { className: 'text-urgent', dotClass: 'bg-urgent' },
};

function StabilityDrawer({ result, onClose, onCreateTask }: {
  result: StabilityResult;
  onClose: () => void;
  onCreateTask: (title: string) => void;
}) {
  const style = BAND_STYLE[result.band] || BAND_STYLE['Watch'];

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-sm font-bold">Stability Breakdown</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Score: <span className={`font-medium ${style.className}`}>{result.score}</span> — {result.band}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Factors */}
            {result.factors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No penalties detected — operations are stable.</p>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Factor Breakdown</h4>
                {result.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-md border border-border">
                    <span className="text-sm">{f.label}</span>
                    <span className="text-sm font-medium text-urgent">−{f.penalty}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Suggested action */}
            {result.suggestedAction && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested Action</p>
                <p className="text-sm font-medium">{result.suggestedAction.title}</p>
                <Button
                  size="sm"
                  variant="default"
                  className="w-full text-xs"
                  onClick={() => {
                    onCreateTask(result.suggestedAction!.title);
                    onClose();
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Task
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <Button size="sm" variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </>
  );
}

export function StabilityScorePanel({ inputs, onCreateTask }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const result = useMemo(() => computeStabilityScore(inputs), [inputs]);

  const style = BAND_STYLE[result.band] || BAND_STYLE['Watch'];
  const hasData = inputs.overdueTasksCount > 0 || inputs.dueSoonCount > 0 || inputs.missedTouchesCount > 0 || inputs.forecast30 > 0 || inputs.moneyAtRiskTotal > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Stability Score</h2>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center text-center py-6 px-4">
          <div className="mb-3 rounded-2xl bg-muted p-3">
            <Activity className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Stable</p>
          <p className="text-xs text-muted-foreground mt-1">Insufficient data</p>
          <Badge variant="outline" className="text-[10px] mt-2 border-muted-foreground/30 text-muted-foreground">LOW</Badge>
        </div>
      ) : (
        <div
          className="cursor-pointer hover:bg-accent/30 rounded-md transition-colors p-1 -m-1"
          onClick={() => setDrawerOpen(true)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`h-2 w-2 rounded-full ${style.dotClass}`} />
            <span className={`text-lg font-bold ${style.className}`}>{result.band}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Score: {result.score}/100</p>

          {result.topReasons.length > 0 && (
            <ul className="space-y-1">
              {result.topReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className={`status-dot mt-1 shrink-0 ${style.dotClass}`} />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-end mt-2">
            <span className="text-xs text-primary flex items-center gap-0.5">
              Details <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      )}

      {drawerOpen && (
        <StabilityDrawer
          result={result}
          onClose={() => setDrawerOpen(false)}
          onCreateTask={onCreateTask}
        />
      )}
    </div>
  );
}
