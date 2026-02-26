import { useState, useMemo, useCallback, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle,
  Clock, MapPin, Briefcase, ListChecks, Download, Link2, Copy, X, Check
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, parseISO,
  areIntervalsOverlapping
} from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  description?: string | null;
  source: 'fub' | 'task' | 'deal';
  sourceLabel: string;
  color: string; // semantic token class
  relatedId?: string;
}

interface ConflictPair {
  a: CalendarEvent;
  b: CalendarEvent;
}

// ─── Helpers ─────────────────────────────────────────────────────

function generateICSEvent(event: CalendarEvent): string {
  const uid = `${event.id}@dealpilot`;
  const dtStart = formatICSDate(event.startAt);
  const dtEnd = event.endAt ? formatICSDate(event.endAt) : formatICSDate(event.startAt, 60);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

function generateICSFile(events: CalendarEvent[]): string {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deal Pilot//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Deal Pilot',
  ].join('\r\n');
  const body = events.map(generateICSEvent).join('\r\n');
  return `${header}\r\n${body}\r\nEND:VCALENDAR`;
}

function formatICSDate(dateStr: string, addMinutes = 0): string {
  const d = new Date(dateStr);
  if (addMinutes) d.setMinutes(d.getMinutes() + addMinutes);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Calendar Page ───────────────────────────────────────────────

export default function CalendarPage() {
  const { tasks, deals } = useData();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [fubAppointments, setFubAppointments] = useState<any[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Fetch FUB appointments from DB
  useEffect(() => {
    async function fetchAppointments() {
      const { data } = await supabase
        .from('fub_appointments')
        .select('*')
        .order('start_at', { ascending: true });
      if (data) setFubAppointments(data);
    }
    fetchAppointments();
  }, []);

  // Build unified event list
  const events: CalendarEvent[] = useMemo(() => {
    const result: CalendarEvent[] = [];

    // FUB Appointments
    for (const a of fubAppointments) {
      result.push({
        id: `fub-${a.id}`,
        title: a.title || 'Appointment',
        startAt: a.start_at,
        endAt: a.end_at,
        location: a.location,
        description: a.description,
        source: 'fub',
        sourceLabel: 'FUB Appointment',
        color: 'bg-primary',
        relatedId: a.fub_id,
      });
    }

    // Tasks with due dates
    for (const t of tasks) {
      if (t.completedAt) continue;
      result.push({
        id: `task-${t.id}`,
        title: t.title,
        startAt: t.dueAt,
        endAt: null,
        source: 'task',
        sourceLabel: `Task · ${t.type}`,
        color: 'bg-warning',
        relatedId: t.id,
      });
    }

    // Deal milestones
    for (const d of deals) {
      if (d.stage === 'closed') continue;
      // Close date
      result.push({
        id: `deal-close-${d.id}`,
        title: `Close: ${d.title}`,
        startAt: d.closeDate,
        endAt: null,
        source: 'deal',
        sourceLabel: 'Deal Close Date',
        color: 'bg-accent',
        relatedId: d.id,
      });
      // Milestones
      if (d.milestoneStatus?.inspection === 'scheduled') {
        result.push({
          id: `deal-insp-${d.id}`,
          title: `Inspection: ${d.title}`,
          startAt: d.closeDate, // approximate — uses close date
          source: 'deal',
          sourceLabel: 'Inspection',
          color: 'bg-secondary',
          relatedId: d.id,
        });
      }
    }

    return result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [fubAppointments, tasks, deals]);

  // Conflict detection
  const conflicts: ConflictPair[] = useMemo(() => {
    const pairs: ConflictPair[] = [];
    const timed = events.filter(e => e.endAt); // Only events with duration
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const a = timed[i], b = timed[j];
        try {
          if (areIntervalsOverlapping(
            { start: new Date(a.startAt), end: new Date(a.endAt!) },
            { start: new Date(b.startAt), end: new Date(b.endAt!) }
          )) {
            pairs.push({ a, b });
          }
        } catch {}
      }
    }
    return pairs;
  }, [events]);

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const weeks: Date[][] = useMemo(() => {
    const result: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [calStart.getTime(), calEnd.getTime()]);

  const eventsForDate = useCallback((date: Date) => {
    return events.filter(e => isSameDay(parseISO(e.startAt), date));
  }, [events]);

  const selectedDateEvents = selectedDate ? eventsForDate(selectedDate) : [];

  // Export handlers
  const handleExportSingle = (event: CalendarEvent) => {
    const ics = generateICSFile([event]);
    downloadICS(ics, `${event.title.replace(/\s+/g, '-')}.ics`);
    toast({ title: 'Downloaded', description: 'Calendar event file ready to import.' });
  };

  const handleExportAll = () => {
    const ics = generateICSFile(events);
    downloadICS(ics, 'deal-pilot-calendar.ics');
    toast({ title: 'Downloaded', description: `${events.length} events exported.` });
  };

  const handleGenerateSubscribeUrl = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast({ title: 'Error', description: 'Not signed in.', variant: 'destructive' }); return; }
      
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/calendar-feed?token=${session.access_token}`;
      setSubscribeUrl(url);
    } catch {
      toast({ title: 'Error', description: 'Could not generate URL.', variant: 'destructive' });
    }
  };

  const handleCopyUrl = () => {
    if (subscribeUrl) {
      navigator.clipboard.writeText(subscribeUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      toast({ title: 'Copied!', description: 'Paste this URL in your calendar app\'s subscription settings.' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Appointments, tasks & deal milestones</p>
        </div>
        <div className="flex items-center gap-2">
          {conflicts.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowConflicts(true)} className="text-destructive border-destructive/30">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              {conflicts.length} Conflict{conflicts.length !== 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export All
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateSubscribeUrl}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Subscribe
          </Button>
        </div>
      </div>

      {/* Subscribe URL banner */}
      {subscribeUrl && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-muted/50 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Calendar Subscription URL</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSubscribeUrl(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Add this URL in Apple Calendar (File → New Calendar Subscription) or Google Calendar (Other calendars → From URL).</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 truncate">{subscribeUrl}</code>
            <Button size="sm" variant="outline" onClick={handleCopyUrl}>
              {copiedUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Note: This URL uses your current session token. For a permanent subscription, we recommend re-generating periodically.</p>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> FUB Appointments</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Tasks</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> Deal Milestones</span>
      </div>

      {/* Calendar grid */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }} className="border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }} className="border-b border-border last:border-b-0">
            {week.map((day, di) => {
              const dayEvents = eventsForDate(day);
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);
              const selected = selectedDate && isSameDay(day, selectedDate);
              return (
                <button
                  key={di}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'relative min-h-[60px] sm:min-h-[80px] p-1 text-left border-r border-border last:border-r-0 transition-colors hover:bg-accent/30',
                    !inMonth && 'opacity-40',
                    selected && 'bg-accent/50 ring-1 ring-primary/30',
                  )}
                >
                  <span className={cn(
                    'text-xs font-medium block mb-0.5',
                    today && 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center mx-auto sm:mx-0',
                  )}>
                    {format(day, 'd')}
                  </span>
                  {/* Event dots / mini cards */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div
                        key={ev.id}
                        className={cn('hidden sm:block text-[9px] px-1 py-0.5 rounded truncate text-foreground', ev.color, 'bg-opacity-20')}
                        onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {/* Mobile: just dots */}
                    <div className="flex gap-0.5 sm:hidden justify-center">
                      {dayEvents.slice(0, 4).map(ev => (
                        <span key={ev.id} className={cn('h-1.5 w-1.5 rounded-full', ev.color)} />
                      ))}
                    </div>
                    {dayEvents.length > 3 && (
                      <span className="hidden sm:block text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day detail panel (below calendar on mobile, side panel feel) */}
      {selectedDate && selectedDateEvents.length > 0 && (
        <div className="mt-4 border border-border rounded-lg bg-card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {selectedDateEvents.map(ev => (
              <button
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                className="w-full text-left flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <span className={cn('h-3 w-3 rounded-full mt-0.5 shrink-0', ev.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(ev.startAt), 'h:mm a')}
                    {ev.endAt && ` – ${format(parseISO(ev.endAt), 'h:mm a')}`}
                  </div>
                  {ev.location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3" /> {ev.location}
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{ev.sourceLabel}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDate && selectedDateEvents.length === 0 && (
        <div className="mt-4 border border-border rounded-lg bg-card p-6 text-center animate-fade-in">
          <CalendarIcon className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No events on {format(selectedDate, 'MMMM d')}</p>
        </div>
      )}

      {/* Event detail sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={open => !open && setSelectedEvent(null)}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className={cn('h-3 w-3 rounded-full shrink-0', selectedEvent.color)} />
                  {selectedEvent.title}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{format(parseISO(selectedEvent.startAt), 'EEEE, MMMM d · h:mm a')}</span>
                    {selectedEvent.endAt && <span>– {format(parseISO(selectedEvent.endAt), 'h:mm a')}</span>}
                  </div>
                  {selectedEvent.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedEvent.location}</span>
                    </div>
                  )}
                  {selectedEvent.description && (
                    <p className="text-sm text-muted-foreground mt-2">{selectedEvent.description}</p>
                  )}
                </div>
                <Badge variant="secondary">{selectedEvent.sourceLabel}</Badge>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => handleExportSingle(selectedEvent)} className="flex-1">
                    <Download className="h-3.5 w-3.5 mr-1" /> Add to Calendar
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Conflicts sheet */}
      <Sheet open={showConflicts} onOpenChange={setShowConflicts}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Schedule Conflicts ({conflicts.length})
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            {conflicts.map((c, i) => (
              <div key={i} className="border border-destructive/20 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-destructive">Overlapping Events</p>
                {[c.a, c.b].map(ev => (
                  <div key={ev.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                    <span className={cn('h-2.5 w-2.5 rounded-full mt-0.5 shrink-0', ev.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(ev.startAt), 'h:mm a')}
                        {ev.endAt && ` – ${format(parseISO(ev.endAt), 'h:mm a')}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleExportSingle(ev)}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ))}
            {conflicts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No conflicts detected!</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
