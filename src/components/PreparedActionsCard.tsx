import { useState, useMemo, useCallback } from 'react';
import { Bot, Phone, Mail, MessageSquare, ListTodo, Shield, Flame, Clock, ThumbsUp, ThumbsDown, Minus, X, ChevronRight, Eye, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Deal, Lead, Task, TaskType } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import {
  generatePreparedActions,
  dismissAction,
  getDismissedIds,
  saveFeedback,
  type PreparedAction,
  type AutonomyLevel,
  type PackageType,
} from '@/lib/preparedActions';

// ── Props ────────────────────────────────────────────────────────────

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  autonomyLevel: AutonomyLevel;
  onReviewAction: (action: PreparedAction) => void;
  onExecuteAction: (action: PreparedAction) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const PKG_ICON: Record<PackageType, typeof Phone> = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
  follow_up: ListTodo,
  recovery: Shield,
};

const PKG_LABEL: Record<PackageType, string> = {
  call: 'Call Package',
  text: 'Text Package',
  email: 'Email Package',
  follow_up: 'Follow-Up',
  recovery: 'Recovery Plan',
};

const TIME_STYLE: Record<string, string> = {
  urgent: 'text-urgent',
  today: 'text-warning',
  this_week: 'text-muted-foreground',
};

const TIME_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  today: 'Today',
  this_week: 'This week',
};

const CONFIDENCE_DOT: Record<string, string> = {
  HIGH: 'bg-opportunity',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground',
};

// ── Component ────────────────────────────────────────────────────────

export function PreparedActionsCard({
  deals, leads, tasks, moneyResults, opportunityResults,
  autonomyLevel, onReviewAction, onExecuteAction,
}: Props) {
  const [dismissedIds, setDismissedIds] = useState(() => getDismissedIds());
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const preparedActions = useMemo(() => {
    return generatePreparedActions(deals, leads, tasks, moneyResults, opportunityResults, autonomyLevel);
  }, [deals, leads, tasks, moneyResults, opportunityResults, autonomyLevel]);

  const visibleActions = useMemo(() => {
    return preparedActions.filter(a => !dismissedIds.has(a.id));
  }, [preparedActions, dismissedIds]);

  const handleDismiss = useCallback((actionId: string) => {
    dismissAction(actionId);
    setDismissedIds(prev => new Set(prev).add(actionId));
  }, []);

  const handleFeedback = useCallback((actionId: string, rating: 'yes' | 'somewhat' | 'no') => {
    saveFeedback({ actionId, rating, timestamp: new Date().toISOString() });
    setFeedbackFor(null);
  }, []);

  const handleExecute = useCallback((action: PreparedAction) => {
    onExecuteAction(action);
    setFeedbackFor(action.id);
  }, [onExecuteAction]);

  if (visibleActions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Prepared Actions</CardTitle>
            <Badge variant="outline" className="text-[10px]">{visibleActions.length}</Badge>
          </div>
          <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        <CardDescription className="text-xs">
          Deal Pilot has prepared these actions for you. Nothing is sent automatically.
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {visibleActions.slice(0, 6).map(action => {
            const Icon = PKG_ICON[action.packageType];
            const showFeedback = feedbackFor === action.id;

            return (
              <div key={action.id} className="rounded-md border border-border p-3 space-y-2 hover:bg-accent/30 transition-colors">
                {/* Header row */}
                <div className="flex items-start gap-2">
                  <div className={cn('mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0',
                    action.packageType === 'recovery' ? 'bg-urgent/10 text-urgent' : 'bg-primary/10 text-primary')}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium leading-tight truncate">{action.recommendedAction}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.reason}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0" onClick={() => handleDismiss(action.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className={cn('h-1.5 w-1.5 rounded-full', CONFIDENCE_DOT[action.confidence])} />
                    {action.confidence}
                  </span>
                  <span className={cn('flex items-center gap-1', TIME_STYLE[action.timeSensitivity])}>
                    <Clock className="h-2.5 w-2.5" />
                    {TIME_LABEL[action.timeSensitivity]}
                  </span>
                  {action.value > 0 && (
                    <span className="text-opportunity font-medium">{formatCurrency(action.value)}</span>
                  )}
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{PKG_LABEL[action.packageType]}</Badge>
                </div>

                {/* Signals */}
                {action.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {action.signals.slice(0, 3).map((sig, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{sig}</span>
                    ))}
                  </div>
                )}

                {/* Actions or Feedback */}
                {showFeedback ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Was this helpful?</span>
                    <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => handleFeedback(action.id, 'yes')}>
                      <ThumbsUp className="h-3 w-3 mr-1 text-opportunity" /> Yes
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => handleFeedback(action.id, 'somewhat')}>
                      <Minus className="h-3 w-3 mr-1" /> Somewhat
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => handleFeedback(action.id, 'no')}>
                      <ThumbsDown className="h-3 w-3 mr-1 text-urgent" /> No
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onReviewAction(action)}>
                      <Eye className="h-3 w-3 mr-1" /> Review Action
                    </Button>
                    <Button size="sm" className="text-xs h-7" onClick={() => handleExecute(action)}>
                      <Zap className="h-3 w-3 mr-1" /> Execute Now
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {visibleActions.length > 6 && (
            <p className="text-xs text-muted-foreground text-center py-1">
              +{visibleActions.length - 6} more prepared actions
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
