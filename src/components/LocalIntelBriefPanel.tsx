import { useState, useEffect, useMemo } from 'react';
import { Zap, Clock, Target, MessageSquare, AlertTriangle, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';

interface Props {
  entityId: string;
  entityType: 'lead' | 'deal';
  entityName: string;
  entity: any;
}

interface ActivityEvent {
  touch_type: string;
  note: string | null;
  created_at: string;
}

interface FubActivity {
  activity_type: string;
  subject: string | null;
  body_preview: string | null;
  direction: string | null;
  occurred_at: string;
}

export function LocalIntelBriefPanel({ entityId, entityType, entityName, entity }: Props) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [fubActivities, setFubActivities] = useState<FubActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [actRes, fubRes] = await Promise.all([
        supabase
          .from('activity_events')
          .select('touch_type, note, created_at')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('fub_activity_log')
          .select('activity_type, subject, body_preview, direction, occurred_at')
          .eq('entity_id', entityId)
          .eq('user_id', user.id)
          .order('occurred_at', { ascending: false })
          .limit(100),
      ]);
      setActivities((actRes.data as any[]) || []);
      setFubActivities((fubRes.data as any[]) || []);
      setLoading(false);
    })();
  }, [user, entityId]);

  const insights = useMemo(() => {
    const totalEvents = activities.length + fubActivities.length;

    // Communication breakdown
    const touchTypes: Record<string, number> = {};
    activities.forEach(a => {
      touchTypes[a.touch_type] = (touchTypes[a.touch_type] || 0) + 1;
    });
    const fubTypes: Record<string, number> = {};
    fubActivities.forEach(a => {
      fubTypes[a.activity_type] = (fubTypes[a.activity_type] || 0) + 1;
    });

    // Direction analysis
    let inbound = 0, outbound = 0;
    fubActivities.forEach(a => {
      if (a.direction === 'inbound') inbound++;
      else if (a.direction === 'outbound') outbound++;
    });

    // Timeline
    const allDates = [
      ...activities.map(a => new Date(a.created_at)),
      ...fubActivities.map(a => new Date(a.occurred_at)),
    ].sort((a, b) => a.getTime() - b.getTime());

    const firstContact = allDates[0] || null;
    const lastContact = allDates[allDates.length - 1] || null;
    const daysSinceLastContact = lastContact ? differenceInDays(new Date(), lastContact) : null;
    const relationshipDuration = firstContact ? differenceInDays(new Date(), firstContact) : 0;

    // Avg frequency
    const avgFrequency = relationshipDuration > 0 && totalEvents > 1
      ? Math.round(relationshipDuration / totalEvents)
      : null;

    // Risk signals
    const risks: string[] = [];
    if (daysSinceLastContact !== null && daysSinceLastContact > 14) risks.push(`No contact in ${daysSinceLastContact} days`);
    if (daysSinceLastContact !== null && daysSinceLastContact > 7 && daysSinceLastContact <= 14) risks.push(`Going quiet — ${daysSinceLastContact} days since last touch`);
    if (totalEvents === 0) risks.push('No activity history — relationship needs nurturing');
    if (outbound > 3 && inbound === 0) risks.push('All outbound, no response detected');
    if (entityType === 'lead' && entity?.leadTemperature === 'cold' && totalEvents < 3) risks.push('Cold lead with minimal engagement');
    if (entityType === 'deal' && entity?.riskLevel === 'red') risks.push('Deal flagged as high risk');

    // Opportunity signals
    const opportunities: string[] = [];
    if (inbound > outbound && totalEvents > 2) opportunities.push('Strong inbound engagement — they are reaching out');
    if (entityType === 'lead' && entity?.leadTemperature === 'hot') opportunities.push('Hot lead — prioritize immediate follow-up');
    if (entityType === 'deal' && entity?.stage === 'pending') opportunities.push('Deal pending close — stay attentive');
    if (totalEvents > 10) opportunities.push(`Strong relationship — ${totalEvents} interactions logged`);
    if (daysSinceLastContact !== null && daysSinceLastContact <= 2 && totalEvents > 0) opportunities.push('Recently engaged — momentum is fresh');

    // Recommended action
    let nextAction = 'Log your first touch to start building the relationship.';
    if (daysSinceLastContact !== null && daysSinceLastContact > 14) {
      nextAction = `Re-engage immediately — it's been ${daysSinceLastContact} days. A quick text or call can restart momentum.`;
    } else if (daysSinceLastContact !== null && daysSinceLastContact > 7) {
      nextAction = 'Follow up this week to maintain connection before they go cold.';
    } else if (totalEvents > 0 && daysSinceLastContact !== null && daysSinceLastContact <= 2) {
      nextAction = 'Momentum is good. Continue the conversation or schedule a meeting.';
    } else if (totalEvents > 0) {
      nextAction = 'Check in with a quick text or call to stay top of mind.';
    }

    // Last meaningful exchange
    const lastMeaningful = activities.find(a => a.note && a.note.length > 5) || fubActivities.find(a => a.subject || a.body_preview);
    let lastExchange = 'No meaningful exchanges recorded yet.';
    if (lastMeaningful && 'touch_type' in lastMeaningful) {
      lastExchange = `${lastMeaningful.touch_type} — ${lastMeaningful.note}`;
    } else if (lastMeaningful && 'activity_type' in lastMeaningful) {
      lastExchange = `${(lastMeaningful as FubActivity).activity_type}: ${(lastMeaningful as FubActivity).subject || (lastMeaningful as FubActivity).body_preview || ''}`;
    }

    return {
      totalEvents,
      touchTypes,
      fubTypes,
      inbound,
      outbound,
      firstContact,
      lastContact,
      daysSinceLastContact,
      relationshipDuration,
      avgFrequency,
      risks,
      opportunities,
      nextAction,
      lastExchange,
    };
  }, [activities, fubActivities, entity, entityType]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-center">
        <Activity className="h-4 w-4 animate-pulse text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading intel…</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Intel Brief</span>
          <Badge variant="outline" className="text-[10px]">{insights.totalEvents} events</Badge>
        </div>
        <Badge variant="secondary" className="text-[10px]">Local Analysis</Badge>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Relationship" value={insights.relationshipDuration > 0 ? `${insights.relationshipDuration}d` : '—'} />
          <StatBox label="Last Contact" value={insights.daysSinceLastContact !== null ? `${insights.daysSinceLastContact}d ago` : '—'} />
          <StatBox label="Avg Freq" value={insights.avgFrequency ? `Every ${insights.avgFrequency}d` : '—'} />
        </div>

        {/* Communication Pattern */}
        {insights.totalEvents > 0 && (
          <Section icon={BarChart3} label="Communication Breakdown">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries({ ...insights.touchTypes, ...insights.fubTypes }).map(([type, count]) => (
                <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                  {type} × {count}
                </span>
              ))}
              {insights.inbound > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-opportunity/10 text-opportunity border border-opportunity/20">
                  ↓ {insights.inbound} inbound
                </span>
              )}
              {insights.outbound > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  ↑ {insights.outbound} outbound
                </span>
              )}
            </div>
          </Section>
        )}

        {/* Recommended Next Action */}
        <Section icon={Target} label="Recommended Next Action" accent>
          <p className="text-sm">{insights.nextAction}</p>
        </Section>

        {/* Last Meaningful Exchange */}
        <Section icon={MessageSquare} label="Last Meaningful Exchange">
          <p className="text-xs text-muted-foreground">{insights.lastExchange}</p>
          {insights.lastContact && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {format(insights.lastContact, 'MMM d, yyyy')} — {formatDistanceToNow(insights.lastContact, { addSuffix: true })}
            </p>
          )}
        </Section>

        {/* Risk & Opportunity */}
        <div className="grid grid-cols-2 gap-3">
          {insights.risks.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" /> Risks
              </p>
              <ul className="space-y-1">
                {insights.risks.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>
                ))}
              </ul>
            </div>
          )}
          {insights.opportunities.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-opportunity" /> Opportunities
              </p>
              <ul className="space-y-1">
                {insights.opportunities.map((s, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Empty state */}
        {insights.totalEvents === 0 && insights.risks.length === 0 && insights.opportunities.length === 0 && (
          <div className="text-center py-4">
            <Activity className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity history yet. Log a touch to start building intelligence.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function Section({ icon: Icon, label, accent, children }: { icon: React.ElementType; label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className={accent ? 'rounded-md border border-opportunity/20 bg-opportunity/5 p-3' : ''}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  );
}
