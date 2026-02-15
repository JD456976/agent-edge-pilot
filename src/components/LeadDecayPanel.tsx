import { useMemo } from 'react';
import { UserMinus, Phone, Plus, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Lead, Task } from '@/types';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import { cn } from '@/lib/utils';

interface Props {
  leads: Lead[];
  tasks: Task[];
  opportunityResults: OpportunityHeatResult[];
  onLogTouch: (entityType: 'lead', entityId: string, entityTitle: string) => void;
  onCreateTask: (title: string, leadId: string) => void;
}

interface DecayResult {
  leadId: string;
  leadName: string;
  decayScore: number;
  reasons: string[];
  temperature: string;
}

function daysSince(dateStr: string | undefined | null, now: Date): number {
  if (!dateStr) return Infinity;
  return (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function computeDecayScore(lead: Lead, tasks: Task[], oppResult: OpportunityHeatResult | undefined, now: Date): DecayResult {
  let score = 0;
  const reasons: string[] = [];

  const touchDays = daysSince(lead.lastTouchedAt || lead.lastContactAt, now);

  // Hot lead no touch > 48h
  if (lead.leadTemperature === 'hot' && touchDays > 2) {
    score += 35;
    reasons.push(`Hot lead untouched ${Math.round(touchDays)} days`);
  }

  // Warm lead no touch > 5d
  if (lead.leadTemperature === 'warm' && touchDays > 5) {
    score += 25;
    reasons.push(`Warm lead untouched ${Math.round(touchDays)} days`);
  }

  // General inactivity
  if (touchDays > 7 && lead.leadTemperature !== 'cold') {
    score += 15;
    reasons.push('Extended inactivity');
  }

  // Decreasing engagement (low score)
  if (lead.engagementScore <= 0 && (lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm')) {
    score += 10;
    reasons.push('Low engagement signals');
  }

  // Opportunity heat dropping
  if (oppResult && oppResult.opportunityScore < 25 && (lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm')) {
    score += 15;
    reasons.push('Opportunity heat declining');
  }

  // Repeated ignored follow-ups (multiple overdue tasks)
  const leadTasks = tasks.filter(t => t.relatedLeadId === lead.id && !t.completedAt);
  const overdueTasks = leadTasks.filter(t => new Date(t.dueAt) < now);
  if (overdueTasks.length >= 2) {
    score += 15;
    reasons.push(`${overdueTasks.length} overdue follow-ups`);
  }

  return {
    leadId: lead.id,
    leadName: lead.name,
    decayScore: Math.min(100, Math.max(0, score)),
    reasons,
    temperature: lead.leadTemperature || 'cold',
  };
}

export function LeadDecayPanel({ leads, tasks, opportunityResults, onLogTouch, onCreateTask }: Props) {
  const now = useMemo(() => new Date(), []);

  const decayResults = useMemo(() => {
    const oppMap = new Map(opportunityResults.map(r => [r.leadId, r]));
    return leads
      .filter(l => l.leadTemperature === 'hot' || l.leadTemperature === 'warm')
      .map(l => computeDecayScore(l, tasks, oppMap.get(l.id), now))
      .filter(r => r.decayScore >= 40)
      .sort((a, b) => b.decayScore - a.decayScore)
      .slice(0, 5);
  }, [leads, tasks, opportunityResults, now]);

  if (decayResults.length === 0) return null;

  const critical = decayResults.filter(r => r.decayScore >= 70);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <UserMinus className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold">Leads Slipping Away</h2>
        {critical.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-urgent/30 text-urgent ml-auto">
            {critical.length} critical
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">High-value leads showing disengagement signals.</p>

      <div className="space-y-2">
        {decayResults.map(result => (
          <div key={result.leadId} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{result.leadName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{result.reasons[0]}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <Badge variant="outline" className={cn('text-[10px]', result.decayScore >= 70 ? 'border-urgent/30 text-urgent' : 'border-warning/30 text-warning')}>
                  {result.decayScore >= 70 ? 'High Risk' : 'Declining'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onLogTouch('lead', result.leadId, result.leadName)}>
                <Phone className="h-3 w-3 mr-1" /> Log Touch
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onCreateTask(`Follow up with ${result.leadName}`, result.leadId)}>
                <Plus className="h-3 w-3 mr-1" /> Follow-up
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
