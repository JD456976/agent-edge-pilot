import { useMemo, useState } from 'react';
import { Activity, ChevronRight, X, Plus, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { computeStabilityScore, type StabilityInputs, type StabilityResult } from '@/lib/stabilityModel';
import { cn } from '@/lib/utils';

interface Props {
  inputs: StabilityInputs;
  previousScore?: number;
  weekAvgScore?: number;
  onCreateTask: (title: string) => void;
}

// ── 5-Tier State Labels ────────────────────────────────────────────

type StabilityState = 'Stable' | 'Watch' | 'Strained' | 'Overloaded' | 'Critical';

function getStabilityState(score: number): StabilityState {
  if (score >= 80) return 'Stable';
  if (score >= 60) return 'Watch';
  if (score >= 40) return 'Strained';
  if (score >= 20) return 'Overloaded';
  return 'Critical';
}

const STATE_STYLE: Record<StabilityState, { className: string; dotClass: string; description: string }> = {
  Stable: { className: 'text-foreground', dotClass: 'bg-opportunity', description: 'Operations running smoothly.' },
  Watch: { className: 'text-warning', dotClass: 'bg-warning', description: 'Minor issues detected. Monitor closely.' },
  Strained: { className: 'text-warning', dotClass: 'bg-warning', description: 'Multiple pressure points active. Address items to prevent decline.' },
  Overloaded: { className: 'text-urgent', dotClass: 'bg-urgent', description: 'Operational health is compromised. Reduce new commitments today.' },
  Critical: { className: 'text-urgent', dotClass: 'bg-urgent', description: 'Immediate intervention needed. Focus only on clearing the backlog.' },
};

// ── Trend ──────────────────────────────────────────────────────────

type Trend = 'improving' | 'stable' | 'declining';

function computeTrend(current: number, previous?: number, weekAvg?: number): Trend {
  const ref = previous ?? weekAvg;
  if (ref === undefined) return 'stable';
  if (current > ref + 5) return 'improving';
  if (current < ref - 5) return 'declining';
  return 'stable';
}

const TREND_CONFIG: Record<Trend, { icon: typeof TrendingUp; label: string; className: string }> = {
  improving: { icon: TrendingUp, label: 'Improving', className: 'text-opportunity' },
  stable: { icon: Minus, label: 'Stable', className: 'text-muted-foreground' },
  declining: { icon: TrendingDown, label: 'Declining', className: 'text-urgent' },
};

// ── Recovery Guidance ──────────────────────────────────────────────

function getRecoveryGuidance(score: number, inputs: StabilityInputs): string[] {
  const guidance: string[] = [];
  if (score >= 60) return guidance;

  if (inputs.overdueTasksCount > 0)
    guidance.push(`Clear ${Math.min(3, inputs.overdueTasksCount)} overdue task${inputs.overdueTasksCount > 1 ? 's' : ''} to reduce backlog`);
  if (inputs.missedTouchesCount > 0)
    guidance.push(`Log touches on ${Math.min(3, inputs.missedTouchesCount)} hot lead${inputs.missedTouchesCount > 1 ? 's' : ''}`);
  if (inputs.moneyAtRiskTotal > 0)
    guidance.push('Focus on top deal at risk to protect income');
  if (inputs.overdueTasksCount >= 3)
    guidance.push('Consider delegating lower-priority tasks');

  if (score < 40) {
    guidance.push('Reduce new commitments today');
  }

  return guidance.slice(0, 4);
}

// ── Load Indicator Ranking ─────────────────────────────────────────

interface LoadIndicator {
  label: string;
  severity: 'high' | 'medium' | 'low';
  value: string;
}

function getLoadIndicators(inputs: StabilityInputs, factors: { label: string; penalty: number }[]): LoadIndicator[] {
  const indicators: LoadIndicator[] = [];

  if (inputs.overdueTasksCount > 0) {
    indicators.push({
      label: 'Task overload',
      severity: inputs.overdueTasksCount >= 5 ? 'high' : inputs.overdueTasksCount >= 3 ? 'medium' : 'low',
      value: `${inputs.overdueTasksCount} overdue`,
    });
  }

  if (inputs.missedTouchesCount > 0) {
    indicators.push({
      label: 'Untouched hot leads',
      severity: inputs.missedTouchesCount >= 4 ? 'high' : inputs.missedTouchesCount >= 2 ? 'medium' : 'low',
      value: `${inputs.missedTouchesCount} waiting`,
    });
  }

  if (inputs.dueSoonCount > 0) {
    indicators.push({
      label: 'Upcoming deadline density',
      severity: inputs.dueSoonCount >= 5 ? 'high' : inputs.dueSoonCount >= 3 ? 'medium' : 'low',
      value: `${inputs.dueSoonCount} due within 48h`,
    });
  }

  const concentrationFactor = factors.find(f => f.label.includes('concentrated'));
  if (concentrationFactor) {
    indicators.push({
      label: 'Pipeline concentration risk',
      severity: concentrationFactor.penalty >= 20 ? 'high' : 'medium',
      value: concentrationFactor.label,
    });
  }

  const riskFactor = factors.find(f => f.label.includes('money at risk'));
  if (riskFactor) {
    indicators.push({
      label: 'Financial exposure',
      severity: riskFactor.penalty >= 20 ? 'high' : 'medium',
      value: riskFactor.label,
    });
  }

  // Sort by severity
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return indicators.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 3);
}

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-urgent',
  medium: 'bg-warning',
  low: 'bg-muted-foreground',
};

// ── Drawer ─────────────────────────────────────────────────────────

function StabilityDrawerV2({ result, state, trend, loadIndicators, recoveryGuidance, inputs, onClose, onCreateTask }: {
  result: StabilityResult;
  state: StabilityState;
  trend: Trend;
  loadIndicators: LoadIndicator[];
  recoveryGuidance: string[];
  inputs: StabilityInputs;
  onClose: () => void;
  onCreateTask: (title: string) => void;
}) {
  const style = STATE_STYLE[state];
  const TrendIcon = TREND_CONFIG[trend].icon;

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
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('h-2 w-2 rounded-full', style.dotClass)} />
              <span className={cn('text-xs font-medium', style.className)}>{state}</span>
              <span className="text-xs text-muted-foreground">· {result.score}/100</span>
              <TrendIcon className={cn('h-3 w-3 ml-1', TREND_CONFIG[trend].className)} />
              <span className={cn('text-[10px]', TREND_CONFIG[trend].className)}>{TREND_CONFIG[trend].label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Load Indicators */}
            {loadIndicators.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Contributing Factors</h4>
                {loadIndicators.map((ind, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-md border border-border">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', SEVERITY_DOT[ind.severity])} />
                      <span className="text-sm">{ind.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{ind.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Factor Breakdown */}
            {result.factors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Penalties</h4>
                {result.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-md border border-border">
                    <span className="text-sm">{f.label}</span>
                    <span className="text-sm font-medium text-urgent">−{f.penalty}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recovery Guidance */}
            {recoveryGuidance.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recovery Actions</h4>
                {recoveryGuidance.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-md border border-border">
                    <span className="text-xs text-muted-foreground mt-0.5">{i + 1}.</span>
                    <span className="text-sm flex-1">{g}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Suggested action */}
            {result.suggestedAction && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested Action</p>
                <p className="text-sm font-medium">{result.suggestedAction.title}</p>
                <Button size="sm" variant="default" className="w-full text-xs" onClick={() => { onCreateTask(result.suggestedAction!.title); onClose(); }}>
                  <Plus className="h-3 w-3 mr-1" /> Create Task
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

// ── Main Panel ─────────────────────────────────────────────────────

export function StabilityScorePanelV2({ inputs, previousScore, weekAvgScore, onCreateTask }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const result = useMemo(() => computeStabilityScore(inputs), [inputs]);
  const state = useMemo(() => getStabilityState(result.score), [result.score]);
  const trend = useMemo(() => computeTrend(result.score, previousScore, weekAvgScore), [result.score, previousScore, weekAvgScore]);
  const loadIndicators = useMemo(() => getLoadIndicators(inputs, result.factors), [inputs, result.factors]);
  const recoveryGuidance = useMemo(() => getRecoveryGuidance(result.score, inputs), [result.score, inputs]);

  const style = STATE_STYLE[state];
  const TrendIcon = TREND_CONFIG[trend].icon;
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
          {/* State + Score */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', style.dotClass)} />
              <span className={cn('text-lg font-bold', style.className)}>{state}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendIcon className={cn('h-3.5 w-3.5', TREND_CONFIG[trend].className)} />
              <span className={cn('text-xs font-medium', TREND_CONFIG[trend].className)}>
                {TREND_CONFIG[trend].label}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Score: {result.score}/100</p>

          {/* Top load indicators */}
          {loadIndicators.length > 0 && (
            <ul className="space-y-1 mb-2">
              {loadIndicators.slice(0, 3).map((ind, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', SEVERITY_DOT[ind.severity])} />
                  <span>{ind.label}</span>
                  <span className="ml-auto text-[10px]">{ind.value}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Recovery hint */}
          {result.score < 60 && recoveryGuidance.length > 0 && (
            <div className="rounded-md border border-border bg-background/50 p-2 mb-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Recovery</p>
              <p className="text-xs text-muted-foreground">{recoveryGuidance[0]}</p>
            </div>
          )}

          {/* Protection mode warning */}
          {result.score < 35 && (
            <div className="flex items-center gap-2 rounded-md border border-urgent/20 bg-urgent/5 p-2 mb-2">
              <AlertTriangle className="h-3 w-3 text-urgent shrink-0" />
              <p className="text-[10px] text-urgent/80">Stability protection active. Prioritize restoration over new income.</p>
            </div>
          )}

          <div className="flex items-center justify-end mt-1">
            <span className="text-xs text-primary flex items-center gap-0.5">
              Details <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      )}

      {drawerOpen && (
        <StabilityDrawerV2
          result={result}
          state={state}
          trend={trend}
          loadIndicators={loadIndicators}
          recoveryGuidance={recoveryGuidance}
          inputs={inputs}
          onClose={() => setDrawerOpen(false)}
          onCreateTask={onCreateTask}
        />
      )}
    </div>
  );
}
