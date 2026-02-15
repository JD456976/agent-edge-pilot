import { useMemo } from 'react';
import { Shield, Flame, ListChecks, CheckCircle2, Phone, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionMode } from '@/hooks/useSessionMode';
import type { SessionStartSnapshot } from '@/hooks/useSessionMode';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { Task, Deal, Lead } from '@/types';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

// ── Morning Focus Card ──────────────────────────────────────────────

interface MorningFocusProps {
  topRisk: MoneyModelResult | null;
  topOpportunity: OpportunityHeatResult | null;
  deals: Deal[];
  leads: Lead[];
  overdueTasks: Task[];
  onStartAction: () => void;
  onReviewAll: () => void;
}

export function MorningFocusCard({ topRisk, topOpportunity, deals, leads, overdueTasks, onStartAction, onReviewAll }: MorningFocusProps) {
  const riskDeal = useMemo(() => topRisk ? deals.find(d => d.id === topRisk.dealId) : null, [topRisk, deals]);
  const oppLead = useMemo(() => topOpportunity ? leads.find(l => l.id === topOpportunity.leadId) : null, [topOpportunity, leads]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Focus First</h3>
      </div>

      <div className="space-y-2">
        {riskDeal && topRisk && (
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-3.5 w-3.5 text-urgent shrink-0" />
            <span className="text-muted-foreground truncate">
              {riskDeal.title} — <span className="text-urgent font-medium">{formatCurrency(topRisk.personalCommissionAtRisk)} at risk</span>
            </span>
          </div>
        )}
        {oppLead && topOpportunity && (
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-3.5 w-3.5 text-opportunity shrink-0" />
            <span className="text-muted-foreground truncate">
              {oppLead.name} — <span className="text-opportunity font-medium">{formatCurrency(topOpportunity.opportunityValue)} opportunity</span>
            </span>
          </div>
        )}
        {overdueTasks.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="text-muted-foreground">{overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {!riskDeal && !oppLead && overdueTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No urgent items. Start with opportunities.</p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="text-xs" onClick={onStartAction}>
          Start First Action
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={onReviewAll}>
          Review all priorities
        </Button>
      </div>
    </div>
  );
}

// ── Midday Stabilization Indicator ──────────────────────────────────

interface MiddayStabilizationProps {
  currentTotalRisk: number;
  sessionStart: SessionStartSnapshot | null;
  risksReducedToday: number;
}

export function MiddayStabilizationCard({ currentTotalRisk, sessionStart, risksReducedToday }: MiddayStabilizationProps) {
  const delta = sessionStart ? currentTotalRisk - sessionStart.totalMoneyAtRisk : 0;

  let message: string;
  let className: string;
  if (delta < -500) {
    message = 'Income risk is stabilizing';
    className = 'text-foreground';
  } else if (delta > 500) {
    message = 'Income risk is increasing';
    className = 'text-foreground';
  } else {
    message = 'Risk level stable';
    className = 'text-muted-foreground';
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Midday Check</h3>
      </div>
      <p className={`text-sm font-medium ${className}`}>{message}</p>
      {sessionStart && (
        <p className="text-xs text-muted-foreground">
          {delta <= 0 ? '↓' : '↑'} {formatCurrency(Math.abs(delta))} since session start
        </p>
      )}
      {risksReducedToday > 0 && (
        <p className="text-xs text-muted-foreground">Risks reduced today: {risksReducedToday}</p>
      )}
    </div>
  );
}

// ── End-of-Day Safety Check ─────────────────────────────────────────

interface EodSafetyProps {
  untouchedRiskDeals: Deal[];
  untouchedHotLeads: Lead[];
  overdueTasks: Task[];
  onLogTouch: () => void;
  onCreateTask: () => void;
  onReviewItems: () => void;
}

export function EodSafetyCard({ untouchedRiskDeals, untouchedHotLeads, overdueTasks, onLogTouch, onCreateTask, onReviewItems }: EodSafetyProps) {
  const hasIssues = untouchedRiskDeals.length > 0 || untouchedHotLeads.length > 0 || overdueTasks.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">End-of-Day Check</h3>
      </div>

      {!hasIssues ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">You're safe to log off.</p>
          <p className="text-xs text-muted-foreground">No urgent items remaining.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Consider addressing these before tomorrow.</p>
          <ul className="space-y-1.5">
            {untouchedRiskDeals.length > 0 && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="status-dot bg-urgent shrink-0" />
                {untouchedRiskDeals.length} urgent deal{untouchedRiskDeals.length !== 1 ? 's' : ''} without touches today
              </li>
            )}
            {untouchedHotLeads.length > 0 && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="status-dot bg-opportunity shrink-0" />
                {untouchedHotLeads.length} high-opportunity lead{untouchedHotLeads.length !== 1 ? 's' : ''} untouched today
              </li>
            )}
            {overdueTasks.length > 0 && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="status-dot bg-warning shrink-0" />
                {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''}
              </li>
            )}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-xs" onClick={onLogTouch}>
              <Phone className="h-3 w-3 mr-1" /> Log Touch
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={onCreateTask}>
              <ClipboardList className="h-3 w-3 mr-1" /> Create Task
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={onReviewItems}>
              Review Items
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
