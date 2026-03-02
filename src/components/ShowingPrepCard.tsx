import { useMemo } from 'react';
import { MapPin, Home, Clock, ChevronRight, CheckCircle2, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, formatDistanceToNow, differenceInHours, differenceInMinutes } from 'date-fns';
import type { Lead, Task } from '@/types';

interface ShowingPrepCardProps {
  appointment: {
    id: string;
    title: string;
    start_at: string;
    end_at?: string | null;
    location?: string | null;
    related_lead_id?: string | null;
  };
  lead: Lead;
  tasks: Task[];
  onOpenLead: (lead: Lead) => void;
  onLogTouch: (entityType: 'lead', entityId: string, entityTitle: string) => void;
  onCreateTask: (title: string, leadId: string) => void;
}

function formatAddress(location: string): string {
  return location.replace(/([a-z])([A-Z])/g, '$1, $2').trim();
}

function buildWantsSummary(lead: Lead): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  const tags = lead.statusTags || [];

  const budgetTag = tags.find(t => /\$[\d,k]+/i.test(t));
  if (budgetTag) items.push({ label: 'Budget', value: budgetTag });

  const locationTag = tags.find(t => /woburn|boston|newton|needham|natick|walpole|norfolk|medfield|millis|sharon|canton|stoughton|foxboro|ma\b/i.test(t));
  if (locationTag) items.push({ label: 'Area', value: locationTag });

  const preApproved = tags.some(t => /pre.approv|preapproval/i.test(t));
  if (preApproved) items.push({ label: 'Pre-approval', value: 'Confirmed' });

  if (lead.source) items.push({ label: 'Source', value: lead.source });

  return items;
}

function generateTalkingPoints(lead: Lead, appointment: { location?: string | null }): string[] {
  const points: string[] = [];
  const tags = lead.statusTags || [];
  const name = lead.name.split(' ')[0];

  if (appointment.location) {
    const addr = formatAddress(appointment.location);
    points.push(`Walk them through the highlights of ${addr} — let them lead the conversation about what they notice`);
  }

  const budgetTag = tags.find(t => /\$[\d,k]+/i.test(t));
  if (budgetTag) {
    points.push(`Confirm ${budgetTag} is still their range — prices in this area have been moving`);
  } else {
    points.push(`Ask ${name} to recap their ideal price point — this showing is a good chance to calibrate`);
  }

  const hasTimeline = tags.some(t => /lease|expire|school|start|moving|must|urgent/i.test(t));
  if (hasTimeline) {
    points.push(`Their timeline seems real — ask what happens if the right place doesn't come up soon`);
  } else {
    points.push(`Understand their actual urgency — are they actively making offers elsewhere?`);
  }

  const isPreApproved = tags.some(t => /pre.approv/i.test(t));
  if (isPreApproved) {
    points.push(`Pre-approval is in place — if they love it, you can move fast`);
  } else {
    points.push(`If they're interested, loop in a lender conversation today — don't lose momentum`);
  }

  if (lead.leadTemperature === 'hot') {
    points.push(`${name} is hot — if this isn't the one, have a next property ready to show`);
  }

  return points.slice(0, 4);
}

export function ShowingPrepCard({ appointment, lead, tasks, onOpenLead, onLogTouch, onCreateTask }: ShowingPrepCardProps) {
  const start = new Date(appointment.start_at);
  const hoursUntil = differenceInHours(start, new Date());
  const minutesUntil = differenceInMinutes(start, new Date());
  const isUrgent = hoursUntil <= 4 && hoursUntil >= 0;

  const timeLabel = useMemo(() => {
    const dayPrefix = isToday(start) ? 'Today' : isTomorrow(start) ? 'Tomorrow' : format(start, 'EEE, MMM d');
    const startTime = format(start, 'h:mm a');
    const endTime = appointment.end_at ? ` – ${format(new Date(appointment.end_at), 'h:mm a')}` : '';
    return `${dayPrefix} ${startTime}${endTime}`;
  }, [start, appointment.end_at]);

  const countdown = useMemo(() => {
    if (minutesUntil <= 0) return null;
    return formatDistanceToNow(start, { addSuffix: false });
  }, [start, minutesUntil]);

  const wantsSummary = useMemo(() => buildWantsSummary(lead), [lead]);
  const talkingPoints = useMemo(() => generateTalkingPoints(lead, appointment), [lead, appointment]);

  const relatedTasks = useMemo(() => {
    return tasks
      .filter(t => t.relatedLeadId === lead.id && !t.completedAt)
      .slice(0, 2);
  }, [tasks, lead.id]);

  const lastContactLabel = useMemo(() => {
    const d = lead.lastTouchedAt || lead.lastContactAt;
    if (!d) return 'Never contacted';
    return formatDistanceToNow(new Date(d), { addSuffix: true });
  }, [lead.lastTouchedAt, lead.lastContactAt]);

  const tempConfig: Record<string, { variant: 'urgent' | 'warning' | 'opportunity' }> = {
    hot: { variant: 'urgent' },
    warm: { variant: 'warning' },
    cold: { variant: 'outline' as any },
  };

  return (
    <div className={cn(
      'rounded-lg border-2 p-4 space-y-3',
      isUrgent ? 'border-warning/50 bg-warning/5' : 'border-primary/30 bg-primary/5'
    )}>
      {/* Label */}
      <p className="text-[10px] uppercase tracking-widest text-primary font-medium">Showing Prep</p>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">{timeLabel}</span>
        </div>
        {countdown && (
          <span className={cn(
            'text-xs font-medium',
            isUrgent ? 'text-warning' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3 inline mr-1" />
            in {countdown}
          </span>
        )}
      </div>

      {/* Location */}
      {appointment.location && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Home className="h-3.5 w-3.5 shrink-0" />
          <span>{formatAddress(appointment.location)}</span>
        </div>
      )}

      {/* Lead chip */}
      <button
        onClick={() => onOpenLead(lead)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 hover:bg-accent/50 transition-colors w-full text-left group"
      >
        <span className="text-sm font-medium truncate flex-1">{lead.name}</span>
        {lead.leadTemperature && (
          <Badge variant={tempConfig[lead.leadTemperature]?.variant || 'outline'} className="text-[10px] shrink-0">
            {lead.leadTemperature}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">{lastContactLabel}</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>

      {/* What They Want */}
      {wantsSummary.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">What They Want</p>
          <div className="flex flex-wrap gap-2">
            {wantsSummary.map((item, i) => (
              <div key={i} className="rounded-md border border-border bg-background px-2 py-1">
                <span className="text-[10px] text-muted-foreground">{item.label}: </span>
                <span className="text-xs font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Talking Points */}
      {talkingPoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Talking Points</p>
          <div className="space-y-1">
            {talkingPoints.map((point, i) => (
              <div key={i} className="flex items-start gap-2 pl-1 border-l-2 border-primary/20 ml-1">
                <ArrowRight className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/80">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open Tasks */}
      {relatedTasks.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Open Tasks</p>
          <div className="space-y-1">
            {relatedTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => onLogTouch('lead', lead.id, lead.name)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Log Showing
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5"
          onClick={() => onCreateTask('Follow up after showing', lead.id)}
        >
          <Plus className="h-3.5 w-3.5" />
          Create Follow-Up
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs gap-1.5 ml-auto"
          onClick={() => onOpenLead(lead)}
        >
          Open Full Record
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
