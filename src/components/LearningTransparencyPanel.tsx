import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, RotateCcw, TrendingUp, Activity, Lightbulb, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LearningSnapshot } from '@/lib/learningEngine';

interface Props {
  snapshot: LearningSnapshot;
  onReset?: () => void;
}

const CATEGORY_ICON = {
  accuracy: TrendingUp,
  behavior: Activity,
  income: BarChart3,
  effectiveness: Lightbulb,
} as const;

const CATEGORY_COLOR = {
  accuracy: 'text-opportunity',
  behavior: 'text-primary',
  income: 'text-warning',
  effectiveness: 'text-foreground',
} as const;

export function LearningTransparencyPanel({ snapshot, onReset }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const { calibration, insights, correlations, behavioralPattern, actionEffectiveness } = snapshot;
  const hasData = calibration.totalOutcomes > 0;

  const avgAccuracy = (
    calibration.failurePredictionAccuracy +
    calibration.ghostingPredictionAccuracy +
    calibration.conversionPredictionAccuracy
  ) / 3;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">How Deal Pilot Is Adapting</p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <span className="text-[10px] text-muted-foreground">{calibration.totalOutcomes} outcomes tracked</span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {!hasData && !expanded && (
        <p className="text-xs text-muted-foreground">
          Deal Pilot is learning your patterns. Complete tasks and close deals to improve recommendations.
        </p>
      )}

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Prediction Accuracy */}
          {hasData && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Prediction Accuracy</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deal Failure</span>
                  <span className={cn('font-medium', calibration.failurePredictionAccuracy > 0.6 ? 'text-opportunity' : 'text-muted-foreground')}>
                    {Math.round(calibration.failurePredictionAccuracy * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client Ghosting</span>
                  <span className={cn('font-medium', calibration.ghostingPredictionAccuracy > 0.6 ? 'text-opportunity' : 'text-muted-foreground')}>
                    {Math.round(calibration.ghostingPredictionAccuracy * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conversion</span>
                  <span className={cn('font-medium', calibration.conversionPredictionAccuracy > 0.6 ? 'text-opportunity' : 'text-muted-foreground')}>
                    {Math.round(calibration.conversionPredictionAccuracy * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Forecast</span>
                  <span className={cn('font-medium', calibration.forecastReliability > 0.6 ? 'text-opportunity' : 'text-muted-foreground')}>
                    {Math.round(calibration.forecastReliability * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Calibration Weights */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calibration Adjustments</p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-2 py-0.5 rounded-full border border-border">
                Stage Prob: {calibration.stageProbabilityMultiplier.toFixed(2)}×
              </span>
              <span className="px-2 py-0.5 rounded-full border border-border">
                Opportunity: {calibration.opportunityMultiplier.toFixed(2)}×
              </span>
              <span className="px-2 py-0.5 rounded-full border border-border">
                Risk Sens: {calibration.riskSensitivityMultiplier.toFixed(2)}×
              </span>
            </div>
          </div>

          {/* Behavioral Pattern */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Work Style</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Workload capacity: <span className="font-medium text-foreground capitalize">{behavioralPattern.workloadTolerance}</span></p>
              {behavioralPattern.preferredChannels.length > 0 && (
                <p>Preferred channels: <span className="font-medium text-foreground">{behavioralPattern.preferredChannels.slice(0, 3).join(', ')}</span></p>
              )}
              {behavioralPattern.avgTasksPerDay > 0 && (
                <p>Avg tasks/day: <span className="font-medium text-foreground">{behavioralPattern.avgTasksPerDay.toFixed(1)}</span></p>
              )}
            </div>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Discovered Patterns</p>
              <div className="space-y-2">
                {insights.slice(0, 5).map(insight => {
                  const Icon = CATEGORY_ICON[insight.category];
                  return (
                    <div key={insight.id} className="flex items-start gap-2">
                      <Icon className={cn('h-3 w-3 mt-0.5 shrink-0', CATEGORY_COLOR[insight.category])} />
                      <div>
                        <p className="text-xs font-medium">{insight.title}</p>
                        <p className="text-[10px] text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reset */}
          <div className="pt-2 border-t border-border">
            {!showReset ? (
              <button onClick={() => setShowReset(true)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                Reset learning data
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">This will clear all learned patterns. Are you sure?</p>
                <Button size="sm" variant="destructive" className="text-[10px] h-6 px-2" onClick={() => { onReset?.(); setShowReset(false); }}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2" onClick={() => setShowReset(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
