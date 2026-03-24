import { useState } from 'react';
import { ShieldAlert, Loader2, Sparkles, Clock, Flame, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { callEdgeFunction } from '@/lib/edgeClient';
import type { Lead } from '@/types';

export interface RiskAssessment {
  score: number;
  level: 'healthy' | 'medium' | 'high';
  factors: string[];
  recommendation: string;
}

export function computeRisk(lead: Lead, heatScore: number): RiskAssessment {
  const factors: string[] = [];
  let riskPoints = 0;

  // Days since last contact
  const daysSinceContact = lead.lastContactAt
    ? (Date.now() - new Date(lead.lastContactAt).getTime()) / 86400000
    : 30;

  if (daysSinceContact > 14) {
    riskPoints += 40;
    factors.push(`${Math.floor(daysSinceContact)} days since last contact`);
  } else if (daysSinceContact > 7) {
    riskPoints += 25;
    factors.push(`${Math.floor(daysSinceContact)} days since last contact`);
  } else if (daysSinceContact > 3) {
    riskPoints += 10;
  }

  // Low engagement score
  if (heatScore < 40) {
    riskPoints += 30;
    factors.push('Very low engagement score');
  } else if (heatScore < 60) {
    riskPoints += 15;
    factors.push('Below-average engagement');
  }

  // No recent activity
  if (!lead.lastTouchedAt) {
    riskPoints += 20;
    factors.push('No recorded activity');
  } else {
    const daysSinceTouched = (Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000;
    if (daysSinceTouched > 10) {
      riskPoints += 15;
      factors.push(`${Math.floor(daysSinceTouched)} days since last touch`);
    }
  }

  // Cold temperature
  if (lead.leadTemperature === 'cold') {
    riskPoints += 10;
    factors.push('Lead marked as cold');
  }

  const score = Math.min(riskPoints, 100);
  const level: RiskAssessment['level'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'healthy';

  // Default recommendation
  let recommendation = 'Lead is healthy — maintain regular contact.';
  if (level === 'high') {
    recommendation = `Urgent: ${Math.floor(daysSinceContact)} days of silence risks losing this lead. Call or text today.`;
  } else if (level === 'medium') {
    recommendation = `Schedule a touchpoint soon — engagement is starting to slip.`;
  }

  if (factors.length === 0) factors.push('No risk factors detected');

  return { score, level, factors, recommendation };
}

export function RiskDot({ level }: { level: RiskAssessment['level'] }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        level === 'healthy' && 'bg-opportunity',
        level === 'medium' && 'bg-warning',
        level === 'high' && 'bg-urgent animate-pulse',
      )}
      aria-label={`Risk: ${level}`}
    />
  );
}

interface RiskPanelProps {
  lead: Lead;
  risk: RiskAssessment;
}

export function RiskPanel({ lead, risk }: RiskPanelProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getAiAnalysis = async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction<{ analysis: string }>('deal-risk-analysis', {
        lead_name: lead.name,
        days_since_contact: lead.lastContactAt
          ? Math.floor((Date.now() - new Date(lead.lastContactAt).getTime()) / 86400000)
          : null,
        engagement_score: lead.engagementScore,
        temperature: lead.leadTemperature || 'unknown',
        source: lead.source,
        notes: lead.notes?.slice(0, 300) || '',
        risk_score: risk.score,
        risk_factors: risk.factors,
      });
      setAiAnalysis(data.analysis);
    } catch {
      setAiAnalysis('Unable to generate AI analysis right now. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = risk.level === 'healthy'
    ? 'text-opportunity'
    : risk.level === 'medium'
      ? 'text-warning'
      : 'text-urgent';

  const scoreBg = risk.level === 'healthy'
    ? 'bg-opportunity/10 border-opportunity/20'
    : risk.level === 'medium'
      ? 'bg-warning/10 border-warning/20'
      : 'bg-urgent/10 border-urgent/20';

  return (
    <div className="mt-2 p-3 rounded-lg border border-border bg-card/80 space-y-3 animate-fade-in">
      {/* Score + Level */}
      <div className="flex items-center gap-3">
        <div className={cn('flex items-center justify-center h-10 w-10 rounded-lg border', scoreBg)}>
          <span className={cn('text-base font-bold', scoreColor)}>{risk.score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className={cn('h-3.5 w-3.5', scoreColor)} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {risk.level === 'healthy' ? 'Healthy' : risk.level === 'medium' ? 'At Risk' : 'High Risk'}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">Deal Risk Score</p>
        </div>
      </div>

      {/* Risk Factors */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Risk Factors</p>
        {risk.factors.map((f, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs">
            {f.includes('days') ? <Clock className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              : f.includes('engagement') || f.includes('score') ? <TrendingDown className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              : <Flame className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Quick Recommendation */}
      <div className={cn('text-xs rounded-md px-2.5 py-2 border', scoreBg)}>
        {risk.recommendation}
      </div>

      {/* AI Analysis */}
      {aiAnalysis ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-[10px] font-medium text-primary uppercase tracking-wide">AI Analysis</p>
          </div>
          <p className="text-xs leading-relaxed">{aiAnalysis}</p>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full min-h-[44px] text-xs gap-1.5"
          onClick={getAiAnalysis}
          disabled={loading}
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> Get AI Risk Analysis</>
          )}
        </Button>
      )}
    </div>
  );
}
