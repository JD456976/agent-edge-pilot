import { X, Zap, DollarSign, AlertTriangle, TrendingUp, Eye, Check, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ScoredEntity, CommandCenterAction, CommandCenterDealAtRisk, CommandCenterOpportunity, CommandCenterSpeedAlert } from '@/types';

type DetailItem =
  | { kind: 'action'; data: CommandCenterAction }
  | { kind: 'deal'; data: CommandCenterDealAtRisk }
  | { kind: 'opportunity'; data: CommandCenterOpportunity }
  | { kind: 'speedAlert'; data: CommandCenterSpeedAlert };

interface Props {
  item: DetailItem | null;
  onClose: () => void;
  onComplete?: (taskId: string) => void;
}

function ScoreBar({ label, value, icon: Icon, colorClass }: { label: string; value: number; icon: React.ElementType; colorClass: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-3.5 w-3.5 ${colorClass} shrink-0`} />
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-7 text-right">{value}</span>
    </div>
  );
}

function ScoresSection({ scores }: { scores: ScoredEntity }) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Breakdown</h4>
      <ScoreBar label="Urgency" value={scores.urgencyScore} icon={Zap} colorClass="text-urgent" />
      <ScoreBar label="Revenue Impact" value={scores.revenueImpactScore} icon={DollarSign} colorClass="text-opportunity" />
      <ScoreBar label="Decay Risk" value={scores.decayRiskScore} icon={AlertTriangle} colorClass="text-warning" />
      <ScoreBar label="Opportunity" value={scores.opportunityScore} icon={TrendingUp} colorClass="text-opportunity" />
      <ScoreBar label="Attention Gap" value={scores.attentionGapScore} icon={Eye} colorClass="text-time-sensitive" />
      <div className="pt-1 border-t border-border flex items-center justify-between">
        <span className="text-xs font-semibold">Overall Priority</span>
        <span className="text-sm font-bold text-primary">{scores.overallPriorityScore}</span>
      </div>
    </div>
  );
}

function ExplanationList({ explanation }: { explanation: string[] }) {
  if (explanation.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Why This Is Ranked</h4>
      <ul className="space-y-1.5">
        {explanation.map((reason, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="status-dot bg-primary mt-1.5 shrink-0" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActionDetailDrawer({ item, onClose, onComplete }: Props) {
  if (!item) return null;

  let title = '';
  let scores: ScoredEntity;
  let subtitle = '';
  let taskId: string | undefined;

  switch (item.kind) {
    case 'action':
      title = item.data.title;
      scores = item.data.scores;
      subtitle = item.data.isSuggested ? 'Suggested Action' : `Score: ${item.data.overallScore}`;
      taskId = item.data.relatedTaskId;
      break;
    case 'deal':
      title = item.data.deal.title;
      scores = item.data.scores;
      subtitle = `$${(item.data.deal.price / 1000).toFixed(0)}K · ${item.data.deal.stage.replace('_', ' ')}`;
      break;
    case 'opportunity':
      title = item.data.lead.name;
      scores = item.data.scores;
      subtitle = `${item.data.lead.source} · Engagement ${item.data.lead.engagementScore}`;
      break;
    case 'speedAlert':
      title = item.data.title;
      scores = item.data.scores;
      subtitle = item.data.detail;
      break;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {item.kind === 'action' && item.data.isSuggested && (
            <Badge variant="timeSensitive" className="text-xs">Suggested by Intelligence Engine</Badge>
          )}

          <ScoresSection scores={scores!} />
          <ExplanationList explanation={scores!.explanation} />
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border flex gap-2">
          {taskId && onComplete && (
            <Button size="sm" variant="default" className="flex-1" onClick={() => { onComplete(taskId!); onClose(); }}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Mark Done
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
