import { useState, useMemo, useEffect } from 'react';
import { Plane, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';
import type { SessionSnapshot } from '@/hooks/useSessionMemory';

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityResult: StabilityResult;
  totalMoneyAtRisk: number;
  previousSnapshot: SessionSnapshot | null;
  onStartActions: () => void;
  onReviewDetail: () => void;
}

const BRIEF_SEEN_KEY = 'dp-brief-seen-today';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `$${n}`;
}

export function MorningBriefCard({
  deals, leads, tasks, moneyResults, opportunityResults, stabilityResult, totalMoneyAtRisk, previousSnapshot,
  onStartActions, onReviewDetail,
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  // Check if already seen today
  useEffect(() => {
    const stored = localStorage.getItem(BRIEF_SEEN_KEY);
    if (stored) {
      const seenDate = new Date(stored);
      const today = new Date();
      if (seenDate.toDateString() === today.toDateString()) {
        setDismissed(true);
      }
    }
  }, []);

  const summary = useMemo(() => {
    const riskDeals = moneyResults.filter(r => r.personalCommissionAtRisk > 0);
    const hotOpps = opportunityResults.filter(r => r.opportunityScore >= 40);
    const potentialIncome = hotOpps.reduce((s, r) => s + r.opportunityValue, 0);

    // Forecast change vs yesterday
    let forecastChange: string | null = null;
    if (previousSnapshot && previousSnapshot.urgentCount !== undefined) {
      const currentUrgent = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date()).length +
        deals.filter(d => d.stage !== 'closed' && (d.riskLevel === 'red' || d.riskLevel === 'yellow')).length;
      const diff = currentUrgent - previousSnapshot.urgentCount;
      if (diff < -1) forecastChange = 'improved since yesterday';
      else if (diff > 1) forecastChange = 'slipped since yesterday';
    }

    // Stability change
    let stabilityChange: string | null = null;
    if (stabilityResult.score >= 70) stabilityChange = 'Pipeline stable';
    else if (stabilityResult.score < 40) stabilityChange = 'Pipeline needs attention';

    // Build headline
    const parts: string[] = [];
    if (totalMoneyAtRisk > 0 && riskDeals.length > 0) {
      parts.push(`protect ${formatCurrency(totalMoneyAtRisk)} across ${riskDeals.length} deal${riskDeals.length !== 1 ? 's' : ''}`);
    }
    if (potentialIncome > 0) {
      parts.push(`advance ~${formatCurrency(potentialIncome)} in potential income`);
    }

    const headline = parts.length > 0
      ? `Today you ${parts.join(' and ')}.`
      : 'No urgent threats detected. Focus on growth opportunities.';

    // Priorities (max 3)
    const priorities: string[] = [];
    if (riskDeals.length > 0) {
      const topRisk = riskDeals[0];
      const deal = deals.find(d => d.id === topRisk.dealId);
      if (deal) priorities.push(`Resolve risk on ${deal.title}`);
    }
    if (hotOpps.length > 0) {
      const topOpp = hotOpps[0];
      const lead = leads.find(l => l.id === topOpp.leadId);
      if (lead) priorities.push(`Engage ${lead.name} — high-intent signal`);
    }
    const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date());
    if (overdue.length > 0) {
      priorities.push(`Clear ${overdue.length} overdue item${overdue.length !== 1 ? 's' : ''}`);
    }

    return { headline, priorities: priorities.slice(0, 3), forecastChange, stabilityChange };
  }, [deals, leads, tasks, moneyResults, opportunityResults, stabilityResult, totalMoneyAtRisk, previousSnapshot]);

  const handleDismiss = () => {
    localStorage.setItem(BRIEF_SEEN_KEY, new Date().toISOString());
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="rounded-lg border border-primary/15 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Today's Flight Plan</p>
        </div>
      </div>

      <p className="text-sm font-medium leading-relaxed">{summary.headline}</p>

      {summary.priorities.length > 0 && (
        <ul className="space-y-1.5">
          {summary.priorities.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-xs text-primary font-mono mt-0.5">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {(summary.forecastChange || summary.stabilityChange) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {summary.forecastChange && <span>Forecast {summary.forecastChange}</span>}
          {summary.stabilityChange && <span>{summary.stabilityChange}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="text-xs gap-1.5" onClick={() => { handleDismiss(); onStartActions(); }}>
          <ArrowRight className="h-3 w-3" /> Start Today's Actions
        </Button>
        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => { handleDismiss(); onReviewDetail(); }}>
          <Eye className="h-3 w-3" /> Review in Detail
        </Button>
      </div>
    </div>
  );
}
