import { useMemo, useState, useEffect } from 'react';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { StabilityResult } from '@/lib/stabilityModel';

interface Props {
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  stabilityResult: StabilityResult;
  totalMoneyAtRisk: number;
}

const INSIGHTS_HASH_KEY = 'dp-insights-hash';
const INSIGHTS_SEEN_COUNT_KEY = 'dp-insights-seen-count';

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `$${n}`;
}

function hashInsights(insights: string[]): string {
  return insights.join('||').replace(/\$[\d,.]+K?/g, '$X'); // Normalize dollar amounts for comparison
}

export function WhatThisMeansPanel({ deals, leads, tasks, moneyResults, opportunityResults, stabilityResult, totalMoneyAtRisk }: Props) {
  const insights = useMemo(() => {
    const result: string[] = [];
    const now = new Date();

    const riskDeals = moneyResults.filter(r => r.personalCommissionAtRisk > 0);
    if (riskDeals.length > 0) {
      result.push(`${riskDeals.length} deal${riskDeals.length !== 1 ? 's' : ''} need${riskDeals.length === 1 ? 's' : ''} attention to protect ~${formatCurrency(totalMoneyAtRisk)}.`);
    }

    const hotLeads = leads.filter(l => l.leadTemperature === 'hot' || l.engagementScore >= 80);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const untouchedHot = hotLeads.filter(l => !l.lastTouchedAt || new Date(l.lastTouchedAt) < todayStart);
    if (untouchedHot.length > 0) {
      result.push(`You have ${untouchedHot.length} high-intent lead${untouchedHot.length !== 1 ? 's' : ''} that haven't been contacted today.`);
    }

    if (stabilityResult.score >= 70) {
      result.push('Pipeline stability is strong — your recent actions are having a positive effect.');
    } else if (stabilityResult.score < 40) {
      result.push('Stability has dropped — consider clearing overdue tasks and addressing risk deals first.');
    }

    const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < now);
    if (overdue.length >= 5) {
      result.push(`${overdue.length} overdue tasks are weighing down your pipeline health.`);
    }

    const hotOpps = opportunityResults.filter(r => r.opportunityScore >= 60);
    if (hotOpps.length > 0 && result.length < 3) {
      const totalOppValue = hotOpps.reduce((s, r) => s + r.opportunityValue, 0);
      result.push(`${hotOpps.length} strong opportunit${hotOpps.length !== 1 ? 'ies' : 'y'} worth ~${formatCurrency(totalOppValue)} are ready for engagement.`);
    }

    if (result.length === 0) {
      result.push('No urgent concerns detected. A good day to focus on building pipeline.');
    }

    return result.slice(0, 3);
  }, [deals, leads, tasks, moneyResults, opportunityResults, stabilityResult, totalMoneyAtRisk]);

  // Staleness detection: auto-collapse if insights haven't meaningfully changed
  const currentHash = useMemo(() => hashInsights(insights), [insights]);
  const [isStale, setIsStale] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const previousHash = localStorage.getItem(INSIGHTS_HASH_KEY);
      const seenCount = parseInt(localStorage.getItem(INSIGHTS_SEEN_COUNT_KEY) || '0', 10);

      if (previousHash === currentHash) {
        const newCount = seenCount + 1;
        localStorage.setItem(INSIGHTS_SEEN_COUNT_KEY, String(newCount));
        if (newCount >= 3) {
          setIsStale(true);
          setCollapsed(true);
        }
      } else {
        localStorage.setItem(INSIGHTS_HASH_KEY, currentHash);
        localStorage.setItem(INSIGHTS_SEEN_COUNT_KEY, '1');
        setIsStale(false);
        setCollapsed(false);
      }
    } catch {}
  }, [currentHash]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full text-left"
      >
        <MessageCircle className="h-4 w-4 text-primary" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium flex-1">What This Means Today</p>
        {isStale && !collapsed && (
          <span className="text-[10px] text-muted-foreground/60 mr-1">No change from last session</span>
        )}
        {collapsed ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="status-dot bg-primary mt-1.5 shrink-0" />
              <span className="text-sm text-muted-foreground leading-relaxed">{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
