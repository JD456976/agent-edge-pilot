import { useMemo } from 'react';
import { Target, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Lead, Task } from '@/types';
import type { OpportunityHeatResult, UserCommissionDefaults } from '@/lib/leadMoneyModel';
import { cn } from '@/lib/utils';

interface Props {
  leads: Lead[];
  tasks: Task[];
  opportunityResults: OpportunityHeatResult[];
  userDefaults?: UserCommissionDefaults;
}

interface ConversionPrediction {
  leadId: string;
  leadName: string;
  conversionScore: number;
  expectedValue: number;
  factors: string[];
}

function formatCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function daysSince(dateStr: string | undefined | null, now: Date): number {
  if (!dateStr) return Infinity;
  return (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function predictConversion(lead: Lead, tasks: Task[], oppResult: OpportunityHeatResult | undefined, now: Date): ConversionPrediction {
  let score = 0;
  const factors: string[] = [];

  // Source reliability (referral sources tend to convert better)
  const source = (lead.source || '').toLowerCase();
  if (source.includes('referral') || source.includes('sphere')) {
    score += 25;
    factors.push('Referral source');
  } else if (source.includes('past client') || source.includes('repeat')) {
    score += 20;
    factors.push('Repeat client');
  } else if (source.includes('sign call') || source.includes('open house')) {
    score += 10;
    factors.push('Direct inquiry');
  }

  // Response speed (new lead with quick touch)
  const createdDays = daysSince(lead.createdAt, now);
  const touchDays = daysSince(lead.lastTouchedAt || lead.lastContactAt, now);
  if (createdDays < 7 && touchDays < 1) {
    score += 20;
    factors.push('Fast response time');
  } else if (createdDays < 14 && touchDays < 3) {
    score += 10;
    factors.push('Timely follow-up');
  }

  // Client readiness (temperature)
  if (lead.leadTemperature === 'hot') {
    score += 20;
    factors.push('Client is hot');
  } else if (lead.leadTemperature === 'warm') {
    score += 10;
    factors.push('Client warming up');
  }

  // Engagement level
  if (lead.engagementScore > 0) {
    score += 10;
    factors.push('Active engagement');
  }

  // Has follow-up scheduled
  const hasTask = tasks.some(t => t.relatedLeadId === lead.id && !t.completedAt);
  if (hasTask) {
    score += 5;
    factors.push('Follow-up scheduled');
  }

  score = Math.min(100, Math.max(0, score));

  const expectedValue = oppResult?.opportunityValue ?? 0;

  return {
    leadId: lead.id,
    leadName: lead.name,
    conversionScore: score,
    expectedValue: Math.round(expectedValue * (score / 100)),
    factors,
  };
}

export function ReferralConversionPanel({ leads, tasks, opportunityResults, userDefaults }: Props) {
  const now = useMemo(() => new Date(), []);

  const predictions = useMemo(() => {
    const oppMap = new Map(opportunityResults.map(r => [r.leadId, r]));
    return leads
      .filter(l => l.leadTemperature !== 'cold' || (l.source || '').toLowerCase().includes('referral'))
      .map(l => predictConversion(l, tasks, oppMap.get(l.id), now))
      .filter(p => p.conversionScore >= 20)
      .sort((a, b) => b.expectedValue - a.expectedValue || b.conversionScore - a.conversionScore)
      .slice(0, 5);
  }, [leads, tasks, opportunityResults, now]);

  if (predictions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-4 w-4 text-opportunity" />
        <h2 className="text-sm font-semibold">Highest Conversion Opportunities</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Leads most likely to close, ranked by expected value.</p>

      <div className="space-y-2">
        {predictions.map(pred => (
          <div key={pred.leadId} className="rounded-md border border-border p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium truncate flex-1 min-w-0">{pred.leadName}</p>
              {pred.expectedValue > 0 && (
                <span className="text-xs font-semibold text-opportunity shrink-0 ml-2">{formatCurrency(pred.expectedValue)}</span>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Conversion likelihood</span>
                <span className="text-[10px] font-medium">{pred.conversionScore}%</span>
              </div>
              <Progress value={pred.conversionScore} className="h-1" />
            </div>
            <div className="flex flex-wrap gap-1">
              {pred.factors.slice(0, 3).map((f, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
