import { useState, useEffect, useCallback } from 'react';
import { Phone, MessageSquare, Mail, Home, StickyNote, Loader2, RefreshCw, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edgeClient';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TOUCH_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
  showing: Home,
  note: StickyNote,
};

interface ActivityEvent {
  id: string;
  touch_type: string;
  note: string | null;
  created_at: string;
  source: 'local' | 'fub';
  direction?: string;
  duration_seconds?: number;
}

interface Props {
  entityType: 'lead' | 'deal';
  entityId: string;
  fubPersonId?: string | null;
  refreshKey?: number;
}

export function ActivityTrail({ entityType, entityId, fubPersonId, refreshKey = 0 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFub, setSyncingFub] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    // Load local activity events
    const { data: localData } = await (supabase
      .from('activity_events' as any)
      .select('id, touch_type, note, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(10) as any);

    const localEvents: ActivityEvent[] = (localData || []).map((e: any) => ({
      ...e,
      source: 'local' as const,
    }));

    // Load FUB activity if available
    const { data: fubData } = await (supabase
      .from('fub_activity_log' as any)
      .select('id, activity_type, body_preview, occurred_at, direction, duration_seconds')
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false })
      .limit(10) as any);

    const fubEvents: ActivityEvent[] = (fubData || []).map((e: any) => ({
      id: e.id,
      touch_type: e.activity_type,
      note: e.body_preview,
      created_at: e.occurred_at,
      source: 'fub' as const,
      direction: e.direction,
      duration_seconds: e.duration_seconds,
    }));

    // Merge and sort
    const merged = [...localEvents, ...fubEvents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    setEvents(merged);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshKey]);

  const syncFubActivity = useCallback(async () => {
    if (!fubPersonId) return;
    setSyncingFub(true);
    try {
      await callEdgeFunction('fub-activity', {
        fub_person_id: fubPersonId,
        entity_id: entityId,
        limit: 20,
      });
      // Reload
      const { data: fubData } = await (supabase
        .from('fub_activity_log' as any)
        .select('id, activity_type, body_preview, occurred_at, direction, duration_seconds')
        .eq('entity_id', entityId)
        .order('occurred_at', { ascending: false })
        .limit(10) as any);

      const fubEvents: ActivityEvent[] = (fubData || []).map((e: any) => ({
        id: e.id,
        touch_type: e.activity_type,
        note: e.body_preview,
        created_at: e.occurred_at,
        source: 'fub' as const,
        direction: e.direction,
        duration_seconds: e.duration_seconds,
      }));

      setEvents(prev => {
        const local = prev.filter(e => e.source === 'local');
        return [...local, ...fubEvents]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);
      });
    } catch (err) {
      console.error('FUB activity sync failed:', err);
    } finally {
      setSyncingFub(false);
    }
  }, [fubPersonId, entityId]);

  if (loading || events.length === 0) {
    return fubPersonId ? (
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</h4>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={syncFubActivity} disabled={syncingFub}>
            {syncingFub ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sync FUB
          </Button>
        </div>
        {loading && <div className="flex justify-center py-2"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>}
      </div>
    ) : null;
  }

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity Timeline</h4>
        {fubPersonId && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={syncFubActivity} disabled={syncingFub}>
            {syncingFub ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sync
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {events.map(ev => {
          const Icon = TOUCH_ICONS[ev.touch_type] || StickyNote;
          return (
            <div key={ev.id} className="flex items-start gap-2 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="capitalize font-medium">{ev.touch_type}</span>
                  {ev.direction && (
                    ev.direction === 'inbound'
                      ? <ArrowDownLeft className="h-3 w-3 text-opportunity" />
                      : <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  )}
                  {ev.source === 'fub' && <Badge variant="outline" className="text-[8px] px-1 py-0">FUB</Badge>}
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </span>
                </div>
                {ev.duration_seconds && ev.duration_seconds > 0 && (
                  <p className="text-muted-foreground mt-0.5">{Math.floor(ev.duration_seconds / 60)}m {ev.duration_seconds % 60}s</p>
                )}
                {ev.note && (
                  <p className="text-muted-foreground truncate mt-0.5">{ev.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
