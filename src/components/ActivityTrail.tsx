import { useState, useEffect } from 'react';
import { Phone, MessageSquare, Mail, Home, StickyNote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

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
}

interface Props {
  entityType: 'lead' | 'deal';
  entityId: string;
}

export function ActivityTrail({ entityType, entityId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase
        .from('activity_events' as any)
        .select('id, touch_type, note, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(5) as any);
      setEvents(data || []);
      setLoading(false);
    })();
  }, [entityType, entityId]);

  if (loading || events.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</h4>
      <div className="space-y-2">
        {events.map(ev => {
          const Icon = TOUCH_ICONS[ev.touch_type] || StickyNote;
          return (
            <div key={ev.id} className="flex items-start gap-2 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="capitalize font-medium">{ev.touch_type}</span>
                <span className="text-muted-foreground ml-1.5">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
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
