import { useState } from 'react';
import { BookMarked, ChevronDown, ChevronUp, Shield, Play, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type NetworkPlaybook, type PlaybookStep, getStepLabel } from '@/hooks/useNetworkPlaybooks';

interface SituationMatch {
  situationKey: string;
  entityId: string;
  entityType: 'lead' | 'deal';
  entityTitle: string;
  reason: string;
}

interface Props {
  playbooks: NetworkPlaybook[];
  situations: SituationMatch[];
  onApplyPlaybook: (playbook: NetworkPlaybook, situation: SituationMatch) => void;
}

const SITUATION_LABELS: Record<string, string> = {
  untouched_hot_lead_48h: 'Hot lead without contact',
  closing_3d_open_issues: 'Closing soon with open issues',
  high_money_risk_pending: 'High money at risk',
  lead_decay_spike: 'Multiple leads decaying',
  ghost_risk_high: 'Ghosting risk detected',
  pipeline_gap_30_60: 'Pipeline gap ahead',
};

const TIMING_LABELS: Record<string, string> = {
  now: 'Now',
  under_1h: 'Within 1 hour',
  same_day: 'Today',
  next_day: 'Tomorrow',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  call: '📞 Call',
  text: '💬 Text',
  email: '📧 Email',
  schedule_task: '📋 Schedule task',
  log_touch: '✏️ Log touch',
  send_listings: '🏠 Send listings',
  request_docs: '📄 Request documents',
  status_check: '🔍 Status check',
};

function EffectivenessBadge({ band }: { band: string }) {
  const config: Record<string, { className: string; label: string }> = {
    high: { className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'High effectiveness' },
    medium: { className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Medium effectiveness' },
    low: { className: 'bg-muted text-muted-foreground border-border', label: 'Early data' },
  };
  const c = config[band] || config.low;
  return <Badge variant="outline" className={cn('text-[10px]', c.className)}>{c.label}</Badge>;
}

function ConfidenceDot({ band }: { band: string }) {
  const color = band === 'HIGH' ? 'bg-emerald-400' : band === 'MEDIUM' ? 'bg-amber-400' : 'bg-muted-foreground';
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      {band} confidence
    </span>
  );
}

export function CohortPlaybooksPanel({ playbooks, situations, onApplyPlaybook }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (playbooks.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-primary" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
          Playbooks That Work in Your Cohort
        </p>
        <Shield className="h-3 w-3 text-muted-foreground ml-auto" />
      </div>

      <p className="text-xs text-muted-foreground">
        Based on anonymized patterns from agents in your cohort. No client data is shared.
      </p>

      <div className="space-y-3">
        {playbooks.map(pb => {
          const situation = situations.find(s => s.situationKey === pb.situationKey);
          if (!situation) return null;
          const isExpanded = expandedId === pb.id;

          return (
            <div key={pb.id} className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : pb.id)}
                className="w-full flex items-start justify-between gap-2"
              >
                <div className="text-left space-y-1">
                  <p className="text-sm font-medium">
                    {SITUATION_LABELS[pb.situationKey] || pb.situationKey.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">{situation.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <EffectivenessBadge band={pb.effectivenessBand} />
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded steps */}
              {isExpanded && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <ConfidenceDot band={pb.confidenceBand} />
                    <span>Cohort: {pb.cohortSize} agents</span>
                  </div>

                  {/* Steps checklist */}
                  <div className="space-y-1.5">
                    {pb.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-1.5 rounded-md">
                        <span className="text-[10px] font-mono text-muted-foreground mt-0.5 w-4 shrink-0">{step.step_order}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {ACTION_TYPE_LABELS[step.action_type] || step.action_type} — {getStepLabel(step.notes_key)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span>{TIMING_LABELS[step.timing_bucket] || step.timing_bucket}</span>
                            {step.follow_up_required && (
                              <span className="flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Follow-up: {TIMING_LABELS[step.recommended_follow_up_timing_bucket || ''] || 'scheduled'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Why this playbook */}
                  <details className="text-[10px]">
                    <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                      <Info className="h-2.5 w-2.5" /> Why this playbook
                    </summary>
                    <div className="mt-1.5 pl-3 text-muted-foreground space-y-0.5">
                      <p>Situation: {situation.reason}</p>
                      <p>Confidence: {pb.confidenceBand} (based on {pb.cohortSize} agents)</p>
                      <p>Effectiveness: {pb.effectivenessBand} — agents following this sequence see better outcomes</p>
                    </div>
                  </details>

                  {/* Apply button */}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => onApplyPlaybook(pb, situation)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Apply Playbook
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Creates local tasks and opens drafts. Nothing is sent automatically.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
