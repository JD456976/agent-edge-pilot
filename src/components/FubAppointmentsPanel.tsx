import { useState, useEffect, useCallback } from 'react';
import { Calendar, Loader2, RefreshCw, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callEdgeFunction } from '@/lib/edgeClient';
import { format, isToday, isTomorrow, differenceInHours } from 'date-fns';

interface Appointment {
  fub_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  attendees: any[];
}

interface Props {
  hasIntegration: boolean;
}

export function FubAppointmentsPanel({ hasIntegration }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);

  const syncAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callEdgeFunction<{ appointments: Appointment[] }>('fub-appointments');
      setAppointments(data.appointments || []);
      setSynced(true);
    } catch (err) {
      console.error('Appointment sync failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasIntegration && !synced) syncAppointments();
  }, [hasIntegration, synced, syncAppointments]);

  if (!hasIntegration) return null;

  const todayAppts = appointments.filter(a => isToday(new Date(a.start_at)));
  const tomorrowAppts = appointments.filter(a => isTomorrow(new Date(a.start_at)));
  const laterAppts = appointments.filter(a => !isToday(new Date(a.start_at)) && !isTomorrow(new Date(a.start_at)));

  const renderAppt = (a: Appointment) => {
    const start = new Date(a.start_at);
    const hoursUntil = differenceInHours(start, new Date());
    return (
      <div key={a.fub_id} className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors">
        <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{a.title}</p>
          <p className="text-xs text-muted-foreground">
            {format(start, 'h:mm a')}
            {a.end_at && ` – ${format(new Date(a.end_at), 'h:mm a')}`}
          </p>
          {a.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" /> {a.location}
            </p>
          )}
        </div>
        {hoursUntil > 0 && hoursUntil <= 2 && (
          <Badge variant="outline" className="text-[10px] text-warning border-warning/30 shrink-0">Soon</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">FUB Appointments</h2>
          <span className="text-xs text-muted-foreground">{appointments.length}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={syncAppointments} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {loading && appointments.length === 0 ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : appointments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No upcoming appointments in FUB.</p>
      ) : (
        <div className="space-y-3">
          {todayAppts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Today</p>
              <div className="space-y-1">{todayAppts.map(renderAppt)}</div>
            </div>
          )}
          {tomorrowAppts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Tomorrow</p>
              <div className="space-y-1">{tomorrowAppts.map(renderAppt)}</div>
            </div>
          )}
          {laterAppts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Upcoming</p>
              <div className="space-y-1">{laterAppts.slice(0, 5).map(renderAppt)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
