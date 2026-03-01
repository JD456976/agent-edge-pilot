import { useState, useMemo, useTransition, useCallback } from 'react';
import { CalendarDays, ChevronDown, Clock, Briefcase, Home, CheckSquare, Download } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { format, isAfter, isBefore, addDays, startOfDay, parseISO, formatISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CollapsiblePanel } from '@/components/CollapsiblePanel';
import type { Deal, Task } from '@/types';

interface FubAppointment {
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  description?: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  type: 'appointment' | 'task' | 'milestone';
  detail?: string;
}

function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateICS(ev: CalendarEvent): string {
  const start = toICSDate(ev.date);
  const end = ev.endDate
    ? toICSDate(ev.endDate)
    : toICSDate(new Date(ev.date.getTime() + 60 * 60 * 1000)); // default 1hr
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DealPilot//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${ev.title.replace(/,/g, '\\,')}`,
    ...(ev.detail ? [`LOCATION:${ev.detail.replace(/,/g, '\\,')}`] : []),
    `UID:${ev.id}@dealpilot`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

function downloadICS(ev: CalendarEvent) {
  const ics = generateICS(ev);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const HORIZON_OPTIONS = [
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
];

function eventIcon(type: CalendarEvent['type']) {
  switch (type) {
    case 'appointment': return <CalendarDays className="h-3.5 w-3.5 text-primary" />;
    case 'task': return <CheckSquare className="h-3.5 w-3.5 text-warning" />;
    case 'milestone': return <Briefcase className="h-3.5 w-3.5 text-opportunity" />;
  }
}

function eventBadge(type: CalendarEvent['type']) {
  switch (type) {
    case 'appointment': return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">Appt</Badge>;
    case 'task': return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/30 text-warning">Task</Badge>;
    case 'milestone': return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-opportunity/30 text-opportunity">Deal</Badge>;
  }
}

interface UpcomingEventsPanelProps {
  deals: Deal[];
  tasks: Task[];
  appointments: FubAppointment[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenLead?: (leadId: string) => void;
  onOpenDeal?: (dealId: string) => void;
}

export function UpcomingEventsPanel({ deals, tasks, appointments, isCollapsed, onToggleCollapse, onOpenLead, onOpenDeal }: UpcomingEventsPanelProps) {
  const [horizon, setHorizon] = useState(7);
  const [isPending, startTransition] = useTransition();
  const { openWorkspace } = useWorkspace();

  const handleHorizonChange = useCallback((value: number) => {
    startTransition(() => {
      setHorizon(value);
    });
  }, []);

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    if (ev.type === 'task') {
      const taskId = ev.id.replace('task-', '');
      const task = tasks.find(t => t.id === taskId);
      if (task?.relatedLeadId && onOpenLead) {
        onOpenLead(task.relatedLeadId);
      } else if (task?.relatedDealId && onOpenDeal) {
        onOpenDeal(task.relatedDealId);
      }
    } else if (ev.type === 'milestone') {
      // Extract deal id from event id (format: "deal-{uuid}-{label}")
      // UUID has 5 dash-separated segments
      const withoutPrefix = ev.id.replace('deal-', '');
      const segments = withoutPrefix.split('-');
      if (segments.length >= 5) {
        const dealId = segments.slice(0, 5).join('-');
        onOpenDeal?.(dealId);
      }
    } else if (ev.type === 'appointment') {
      // Appointments: download ICS as fallback since there's no in-app appointment detail view
      downloadICS(ev);
    }
  }, [tasks, onOpenLead, onOpenDeal]);

  const events = useMemo(() => {
    const now = startOfDay(new Date());
    const cutoff = addDays(now, horizon);
    const result: CalendarEvent[] = [];

    // FUB appointments
    for (const a of appointments) {
      try {
        const d = parseISO(a.start_at);
        if (isAfter(d, now) && isBefore(d, cutoff)) {
          result.push({
            id: `appt-${a.id}`,
            title: a.title || 'Appointment',
            date: d,
            endDate: a.end_at ? parseISO(a.end_at) : undefined,
            type: 'appointment',
            detail: a.location ? a.location.replace(/([a-z])([A-Z])/g, '$1, $2').trim() : undefined,
          });
        }
      } catch {}
    }

    // Tasks (incomplete, with due date in range)
    for (const t of tasks) {
      if (t.completedAt) continue;
      try {
        const d = parseISO(t.dueAt);
        if (isAfter(d, now) && isBefore(d, cutoff)) {
          result.push({
            id: `task-${t.id}`,
            title: t.title,
            date: d,
            type: 'task',
          });
        }
      } catch {}
    }

    // Deal milestones (close dates, inspection, appraisal, financing)
    for (const deal of deals) {
      if (deal.stage === 'closed') continue;
      const milestones: { label: string; dateStr: string }[] = [
        { label: `Close: ${deal.title}`, dateStr: deal.closeDate },
      ];
      if ((deal as any).milestoneInspection) milestones.push({ label: `Inspection: ${deal.title}`, dateStr: (deal as any).milestoneInspection });
      if ((deal as any).milestoneAppraisal) milestones.push({ label: `Appraisal: ${deal.title}`, dateStr: (deal as any).milestoneAppraisal });
      if ((deal as any).milestoneFinancing) milestones.push({ label: `Financing: ${deal.title}`, dateStr: (deal as any).milestoneFinancing });

      for (const m of milestones) {
        try {
          const d = parseISO(m.dateStr);
          if (isAfter(d, now) && isBefore(d, cutoff)) {
            result.push({
              id: `deal-${deal.id}-${m.label}`,
              title: m.label,
              date: d,
              type: 'milestone',
            });
          }
        } catch {}
      }
    }

    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }, [deals, tasks, appointments, horizon]);

  return (
    <CollapsiblePanel
      id="upcoming-events"
      label={`Upcoming Events (${events.length})`}
      icon={<CalendarDays className="h-3.5 w-3.5 text-primary" />}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Upcoming Events</h3>
            <Badge variant="secondary" className="text-[10px]">{events.length}</Badge>
          </div>
          {/* Horizon filter */}
          <div className="flex items-center gap-1">
             {HORIZON_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleHorizonChange(opt.value)}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-medium transition-colors',
                  horizon === opt.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Event list */}
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No upcoming events in the next {horizon} days</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => handleEventClick(ev)}
                className="flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors w-full text-left group cursor-pointer"
              >
                <div className="mt-0.5">{eventIcon(ev.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{ev.title}</span>
                    {eventBadge(ev.type)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      {format(ev.date, 'EEE, MMM d')}
                      {ev.endDate ? ` · ${format(ev.date, 'h:mm a')} – ${format(ev.endDate, 'h:mm a')}` : ev.type === 'appointment' ? ` · ${format(ev.date, 'h:mm a')}` : ''}
                    </span>
                  </div>
                  {ev.detail && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ev.detail}</p>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadICS(ev); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent ml-auto shrink-0"
                  title="Add to calendar"
                >
                  <Download className="h-3 w-3 text-muted-foreground" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
}
