import { useMemo } from 'react';
import { Ghost, Phone, Mail, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Lead, Task, Deal } from '@/types';
import { cn } from '@/lib/utils';
import { GhostingRecoveryAction } from '@/components/GhostingRecoveryAction';

interface Props {
  leads: Lead[];
  tasks: Task[];
  deals: Deal[];
  onLogTouch: (entityType: 'lead', entityId: string, entityTitle: string) => void;
  onCreateTask: (title: string, leadId: string) => void;
  onOpenLead?: (leadId: string) => void;
}

interface GhostingResult {
  leadId: string;
  leadName: string;
  score: number;
  signals: string[];
  hasDealLink: boolean;
}

function daysSince(dateStr: string | undefined | null, now: Date): number {
  if (!dateStr) return Infinity;
  return (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function computeGhostingScore(lead: Lead, tasks: Task[], deals: Deal[], now: Date): GhostingResult {
  let score = 0;
  const signals: string[] = [];

  const contactDays = daysSince(lead.lastContactAt, now);
  const touchDays = daysSince(lead.lastTouchedAt || lead.lastContactAt, now);
  const activityDays = daysSince(lead.lastActivityAt, now);

  // Increasing response delays (contact gap widening)
  if (contactDays > 10) {
    score += 25;
    signals.push(`No contact in ${Math.round(contactDays)} days`);
  } else if (contactDays > 5) {
    score += 15;
    signals.push(`Last contact ${Math.round(contactDays)} days ago`);
  }

  // Ignored follow-ups
  const leadTasks = tasks.filter(t => t.relatedLeadId === lead.id && !t.completedAt);
  const overdue = leadTasks.filter(t => new Date(t.dueAt) < now);
  if (overdue.length >= 2) {
    score += 20;
    signals.push(`${overdue.length} ignored follow-ups`);
  } else if (overdue.length === 1) {
    score += 10;
    signals.push('Pending follow-up overdue');
  }

  // Reduced engagement
  if (lead.engagementScore <= 0 && (lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm')) {
    score += 15;
    signals.push('Engagement signals dropped');
  }

  // No recent activity despite being warm/hot
  if ((lead.leadTemperature === 'hot' || lead.leadTemperature === 'warm') && activityDays > 7) {
    score += 15;
    signals.push('No activity from previously engaged client');
  }

  // Touch gap
  if (touchDays > 7) {
    score += 10;
    signals.push('Communication gap widening');
  }

  // Check if lead has deal links
  const hasDealLink = deals.some(d => d.stage !== 'closed' && d.assignedToUserId === lead.assignedToUserId);

  return {
    leadId: lead.id,
    leadName: lead.name,
    score: Math.min(100, Math.max(0, score)),
    signals,
    hasDealLink,
  };
}

export function GhostingRiskPanel({ leads, tasks, deals, onLogTouch, onCreateTask, onOpenLead }: Props) {
  const now = useMemo(() => new Date(), []);

  const results = useMemo(() => {
    return leads
      .filter(l => l.leadTemperature === 'hot' || l.leadTemperature === 'warm')
      .map(l => computeGhostingScore(l, tasks, deals, now))
      .filter(r => r.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [leads, tasks, deals, now]);

  if (results.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Ghost className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold">Clients at Risk of Going Silent</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Clients showing signs of disengagement.</p>

      <div className="space-y-2">
        {results.map(r => (
          <div key={r.leadId} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p
                  className={cn("text-sm font-medium truncate", onOpenLead && "cursor-pointer hover:text-primary hover:underline underline-offset-2")}
                  onClick={() => onOpenLead?.(r.leadId)}
                >{r.leadName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.signals[0]}</p>
              </div>
              <Badge variant="outline" className={cn('text-[10px] shrink-0 ml-2',
                r.score >= 70 ? 'border-urgent/30 text-urgent' : 'border-warning/30 text-warning'
              )}>
                {r.score >= 70 ? 'High Risk' : 'Fading'}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Ghost risk</span>
                <span className="text-[10px] font-medium">{r.score}/100</span>
              </div>
              <Progress value={r.score} className="h-1" />
            </div>
            {/* Recovery actions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onLogTouch('lead', r.leadId, r.leadName)}>
                <Phone className="h-3 w-3 mr-1" /> Call
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onCreateTask(`Re-engage ${r.leadName} — change approach`, r.leadId)}>
                <MessageSquare className="h-3 w-3 mr-1" /> Re-engage
              </Button>
            </div>
            {/* FUB Ghosting Recovery */}
            <GhostingRecoveryAction leadId={r.leadId} leadName={r.leadName} ghostScore={r.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Utility: check if any high ghosting risk on active deal clients */
export function hasHighGhostingRisk(leads: Lead[], tasks: Task[], deals: Deal[]): boolean {
  const now = new Date();
  return leads
    .filter(l => l.leadTemperature === 'hot' || l.leadTemperature === 'warm')
    .some(l => computeGhostingScore(l, tasks, deals, now).score >= 70);
}
