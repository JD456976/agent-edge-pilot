import { useState, useEffect, useMemo } from 'react';
import { Zap, Clock, Target, MessageSquare, AlertTriangle, TrendingUp, Activity, BarChart3, RefreshCw, Home, MapPin, DollarSign, Tag, Heart, Phone, Mail, MessageCircle, Calendar, ArrowUpRight, ArrowDownLeft, Shield, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { callEdgeFunction } from '@/lib/edgeClient';
import {
  type ActivityEvent, type FubActivity, type FubPersonProfile,
  computeEngagementTrend, computeResponseMetrics, computeChannelPreference,
  computeMilestones, computeHealthScore, analyzePropertyInterest,
} from '@/lib/intelAnalyzer';

interface Props {
  entityId: string;
  entityType: 'lead' | 'deal';
  entityName: string;
  entity: any;
}

export function LocalIntelBriefPanel({ entityId, entityType, entityName, entity }: Props) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [fubActivities, setFubActivities] = useState<FubActivity[]>([]);
  const [personProfile, setPersonProfile] = useState<FubPersonProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingFub, setFetchingFub] = useState(false);

  const fetchLocalData = async () => {
    if (!user) return { acts: [], fubs: [] };
    const [actRes, fubRes] = await Promise.all([
      supabase
        .from('activity_events')
        .select('touch_type, note, created_at')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('fub_activity_log')
        .select('activity_type, subject, body_preview, direction, occurred_at, duration_seconds')
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false })
        .limit(100),
    ]);
    return {
      acts: (actRes.data as any[]) || [],
      fubs: (fubRes.data as any[]) || [],
    };
  };

  const fetchFromFub = async () => {
    if (!user || !entity) return;
    const importedFrom = entity.importedFrom || entity.imported_from;
    const fubPersonId = importedFrom?.startsWith('fub:') ? importedFrom.replace('fub:', '') : null;
    if (!fubPersonId) return;

    setFetchingFub(true);
    try {
      const result = await callEdgeFunction('fub-activity', {
        fub_person_id: parseInt(fubPersonId),
        entity_id: entityId,
        limit: 100,
      });
      if (result?.personProfile) {
        setPersonProfile(result.personProfile as FubPersonProfile);
      }
      const { acts, fubs } = await fetchLocalData();
      setActivities(acts);
      setFubActivities(fubs);
    } catch (err) {
      console.warn('FUB activity fetch failed:', err);
    } finally {
      setFetchingFub(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { acts, fubs } = await fetchLocalData();
      setActivities(acts);
      setFubActivities(fubs);
      setLoading(false);

      if (acts.length === 0 && fubs.length === 0) {
        const importedFrom = entity?.importedFrom || entity?.imported_from;
        if (importedFrom?.startsWith('fub:')) {
          await fetchFromFub();
        }
      } else {
        // Still fetch person profile for property analysis even if we have activity
        const importedFrom = entity?.importedFrom || entity?.imported_from;
        if (importedFrom?.startsWith('fub:')) {
          const fubPersonId = importedFrom.replace('fub:', '');
          try {
            const result = await callEdgeFunction('fub-activity', {
              fub_person_id: parseInt(fubPersonId),
              entity_id: entityId,
              limit: 100,
            });
            if (result?.personProfile) {
              setPersonProfile(result.personProfile as FubPersonProfile);
            }
            // Also refresh fub activities
            const { acts: newActs, fubs: newFubs } = await fetchLocalData();
            setActivities(newActs);
            setFubActivities(newFubs);
          } catch { /* non-critical */ }
        }
      }
    })();
  }, [user, entityId]);

  const insights = useMemo(() => {
    const totalEvents = activities.length + fubActivities.length;
    const allDates = [
      ...activities.map(a => new Date(a.created_at)),
      ...fubActivities.map(a => new Date(a.occurred_at)),
    ].sort((a, b) => a.getTime() - b.getTime());

    const firstContact = allDates[0] || null;
    const lastContact = allDates[allDates.length - 1] || null;
    const daysSinceLastContact = lastContact ? differenceInDays(new Date(), lastContact) : null;
    const relationshipDuration = firstContact ? differenceInDays(new Date(), firstContact) : 0;
    const avgFrequency = relationshipDuration > 0 && totalEvents > 1
      ? Math.round(relationshipDuration / totalEvents) : null;

    // Risks
    const risks: string[] = [];
    if (daysSinceLastContact !== null && daysSinceLastContact > 14) risks.push(`No contact in ${daysSinceLastContact} days`);
    else if (daysSinceLastContact !== null && daysSinceLastContact > 7) risks.push(`Going quiet — ${daysSinceLastContact} days since last touch`);
    if (totalEvents === 0) risks.push('No activity history — relationship needs nurturing');
    if (entityType === 'deal' && entity?.riskLevel === 'red') risks.push('Deal flagged as high risk');

    // Opportunities
    const opportunities: string[] = [];
    if (entityType === 'lead' && entity?.leadTemperature === 'hot') opportunities.push('Hot lead — prioritize immediate follow-up');
    if (entityType === 'deal' && entity?.stage === 'pending') opportunities.push('Deal pending close — stay attentive');
    if (daysSinceLastContact !== null && daysSinceLastContact <= 2 && totalEvents > 0) opportunities.push('Recently engaged — momentum is fresh');

    // Next action
    let nextAction = 'Log your first touch to start building the relationship.';
    if (daysSinceLastContact !== null && daysSinceLastContact > 14) {
      nextAction = `Re-engage immediately — it's been ${daysSinceLastContact} days.`;
    } else if (daysSinceLastContact !== null && daysSinceLastContact > 7) {
      nextAction = 'Follow up this week to maintain connection.';
    } else if (totalEvents > 0 && daysSinceLastContact !== null && daysSinceLastContact <= 2) {
      nextAction = 'Momentum is good. Continue the conversation or schedule a meeting.';
    } else if (totalEvents > 0) {
      nextAction = 'Check in with a quick text or call to stay top of mind.';
    }

    // Computed analytics
    const trend = computeEngagementTrend(activities, fubActivities);
    const response = computeResponseMetrics(fubActivities);
    const channel = computeChannelPreference(activities, fubActivities);
    const milestones = computeMilestones(activities, fubActivities, entity, entityType);
    const health = computeHealthScore(activities, fubActivities, entity, entityType);
    const propertyInterest = analyzePropertyInterest(fubActivities, personProfile, entity);

    return {
      totalEvents, firstContact, lastContact, daysSinceLastContact,
      relationshipDuration, avgFrequency, risks, opportunities, nextAction,
      trend, response, channel, milestones, health, propertyInterest,
    };
  }, [activities, fubActivities, entity, entityType, personProfile]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-center">
        <Activity className="h-4 w-4 animate-pulse text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading intel…</span>
      </div>
    );
  }

  const isFub = entity?.importedFrom?.startsWith('fub:') || entity?.imported_from?.startsWith('fub:');
  const pi = insights.propertyInterest;
  const hasPropertyData = pi.priceRange || pi.propertyTypes.length > 0 || pi.locations.length > 0 || pi.bedrooms || pi.tags.length > 0 || pi.extractedKeywords.length > 0 || pi.background || pi.timeFrame;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Intel Brief</span>
          <Badge variant="outline" className="text-[10px]">{insights.totalEvents} events</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {fetchingFub && <span className="text-[10px] text-muted-foreground animate-pulse">Syncing…</span>}
          {isFub && (
            <button onClick={fetchFromFub} disabled={fetchingFub} className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50" title="Refresh from FUB">
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${fetchingFub ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* ═══ RELATIONSHIP HEALTH SCORE ═══ */}
        <HealthScoreBar health={insights.health} />

        {/* ═══ PROPERTY INTEREST ANALYSIS (PROMINENT) ═══ */}
        {hasPropertyData && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-primary">
              <Home className="h-3.5 w-3.5" /> Property Interest Profile
            </p>

            <div className="grid grid-cols-2 gap-2">
              {pi.priceRange && (
                <InfoChip icon={DollarSign} label="Budget" value={pi.priceRange} />
              )}
              {pi.bedrooms && (
                <InfoChip icon={Home} label="Beds" value={`${pi.bedrooms} BR${pi.bathrooms ? ` / ${pi.bathrooms} BA` : ''}`} />
              )}
              {pi.timeFrame && (
                <InfoChip icon={Calendar} label="Timeline" value={pi.timeFrame} />
              )}
              {pi.preApproved != null && (
                <InfoChip icon={Shield} label="Pre-approved" value={pi.preApproved ? (pi.preApprovalAmount ? `Yes — $${fmtK(pi.preApprovalAmount)}` : 'Yes') : 'No'} />
              )}
              {pi.stage && (
                <InfoChip icon={User} label="FUB Stage" value={pi.stage} />
              )}
              {pi.source && (
                <InfoChip icon={ArrowDownLeft} label="Source" value={pi.source} />
              )}
            </div>

            {pi.locations.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Areas of Interest
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pi.locations.map((loc, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pi.propertyTypes.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Home className="h-3 w-3" /> Property Types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pi.propertyTypes.map((t, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {(pi.tags.length > 0 || pi.extractedKeywords.length > 0) && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Profile Tags & Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pi.tags.map((t, i) => (
                    <span key={`t-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                  ))}
                  {pi.extractedKeywords.map((k, i) => (
                    <span key={`k-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{k}</span>
                  ))}
                </div>
              </div>
            )}

            {pi.background && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Background</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{pi.background}</p>
              </div>
            )}

            {pi.currentAddress && (
              <p className="text-[10px] text-muted-foreground">
                <span className="uppercase tracking-wider">Current address:</span> {pi.currentAddress}
              </p>
            )}
          </div>
        )}

        {/* ═══ SUMMARY STATS ═══ */}
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Relationship" value={insights.relationshipDuration > 0 ? `${insights.relationshipDuration}d` : '—'} />
          <StatBox label="Last Contact" value={insights.daysSinceLastContact !== null ? `${insights.daysSinceLastContact}d ago` : '—'} />
          <StatBox label="Avg Freq" value={insights.avgFrequency ? `Every ${insights.avgFrequency}d` : '—'} />
        </div>

        {/* ═══ ENGAGEMENT TREND SPARKLINE ═══ */}
        {insights.totalEvents > 0 && (
          <Section icon={BarChart3} label="Engagement Trend (12 weeks)">
            <Sparkline data={insights.trend} />
          </Section>
        )}

        {/* ═══ RESPONSE RATE ═══ */}
        {(insights.response.totalOutbound > 0 || insights.response.totalInbound > 0) && (
          <Section icon={MessageSquare} label="Response Metrics">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{insights.response.label}</span>
                  <span className="text-xs font-semibold">{insights.response.responseRatio}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${insights.response.responseRatio}%`,
                      backgroundColor: insights.response.responseRatio >= 60 ? 'hsl(var(--primary))' : insights.response.responseRatio >= 30 ? 'hsl(var(--warning, 45 93% 47%))' : 'hsl(var(--destructive))',
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> {insights.response.totalOutbound} sent</span>
              <span className="flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" /> {insights.response.totalInbound} received</span>
              {insights.response.avgResponseGapDays !== null && (
                <span>Avg reply: {insights.response.avgResponseGapDays}d</span>
              )}
            </div>
          </Section>
        )}

        {/* ═══ CHANNEL PREFERENCE ═══ */}
        {insights.channel.channels.length > 0 && (
          <Section icon={Phone} label="Best Channel">
            <p className="text-xs text-muted-foreground mb-2">{insights.channel.insight}</p>
            <div className="flex gap-1.5 flex-wrap">
              {insights.channel.channels.map(ch => (
                <span key={ch.channel} className={`text-[10px] px-2 py-0.5 rounded-full border ${ch.channel === insights.channel.bestChannel ? 'bg-primary/10 text-primary border-primary/30 font-semibold' : 'bg-accent text-accent-foreground border-transparent'}`}>
                  {channelIcon(ch.channel)} {ch.channel} {ch.pct}%
                  {ch.inboundCount > 0 && <span className="opacity-60"> ({ch.inboundCount} in)</span>}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ KEY MILESTONES ═══ */}
        {insights.milestones.length > 0 && (
          <Section icon={Calendar} label="Key Milestones">
            <div className="relative pl-3 space-y-1.5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
              {insights.milestones.slice(-6).map((m, i) => (
                <div key={i} className="flex items-start gap-2 relative">
                  <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                    m.type === 'gap' ? 'bg-destructive' :
                    m.type === 'first_contact' ? 'bg-primary' :
                    m.type === 'deal' ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                  <div>
                    <span className="text-[11px]">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">{format(m.date, 'MMM d, yyyy')}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ RECOMMENDED ACTION ═══ */}
        <Section icon={Target} label="Recommended Next Action" accent>
          <p className="text-sm">{insights.nextAction}</p>
        </Section>

        {/* ═══ RISKS & OPPORTUNITIES ═══ */}
        <div className="grid grid-cols-2 gap-3">
          {insights.risks.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" /> Risks
              </p>
              <ul className="space-y-1">
                {insights.risks.map((r, i) => <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>)}
              </ul>
            </div>
          )}
          {insights.opportunities.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-primary" /> Opportunities
              </p>
              <ul className="space-y-1">
                {insights.opportunities.map((s, i) => <li key={i} className="text-[11px] text-muted-foreground">• {s}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Empty state */}
        {insights.totalEvents === 0 && !hasPropertyData && (
          <div className="text-center py-4">
            <Activity className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity history yet. Log a touch to start building intelligence.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function HealthScoreBar({ health }: { health: ReturnType<typeof computeHealthScore> }) {
  const colorMap = { red: 'hsl(var(--destructive))', amber: 'hsl(var(--warning, 45 93% 47%))', green: 'hsl(var(--primary))' };
  const bgMap = { red: 'bg-destructive/10', amber: 'bg-warning/10', green: 'bg-primary/10' };
  const textMap = { red: 'text-destructive', amber: 'text-warning', green: 'text-primary' };

  return (
    <div className={`rounded-lg p-3 ${bgMap[health.color]} border border-${health.color === 'red' ? 'destructive' : health.color === 'amber' ? 'warning' : 'primary'}/20`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Heart className={`h-4 w-4 ${textMap[health.color]}`} />
          <span className="text-xs font-semibold">Relationship Health</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${textMap[health.color]}`}>{health.score}</span>
          <Badge variant="outline" className={`text-[10px] ${textMap[health.color]} border-current`}>{health.label}</Badge>
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${health.score}%`, backgroundColor: colorMap[health.color] }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {health.factors.slice(0, 4).map((f, i) => (
          <span key={i} className="text-[9px] text-muted-foreground">{f}</span>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: Array<{ week: string; count: number }> }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-[3px] h-10">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors min-h-[2px]"
            style={{ height: `${Math.max((d.count / max) * 100, 5)}%` }}
          />
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[9px] px-1.5 py-0.5 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
            {d.week}: {d.count}
          </div>
        </div>
      ))}
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
    <div className={accent ? 'rounded-md border border-primary/20 bg-primary/5 p-3' : ''}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-2.5 py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Icon className="h-2.5 w-2.5" /> {label}
      </p>
      <p className="text-xs font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}

function channelIcon(channel: string): string {
  switch (channel) {
    case 'Call': return '📞';
    case 'Email': return '📧';
    case 'Text': return '💬';
    case 'Meeting': return '🤝';
    default: return '📌';
  }
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}
