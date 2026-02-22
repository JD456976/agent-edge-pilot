import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap, Clock, Target, MessageSquare, AlertTriangle, TrendingUp, Activity, BarChart3,
  RefreshCw, Home, MapPin, DollarSign, Tag, Heart, Phone, Mail, MessageCircle,
  Calendar, ArrowUpRight, ArrowDownLeft, Shield, User, Gauge, Repeat, Timer,
  ChevronDown, Flame, Snowflake, Thermometer, FileText, Users, Compass,
  ArrowRight, Zap as ZapIcon, Radio, LayoutGrid
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { callEdgeFunction } from '@/lib/edgeClient';
import { ExpandableContent } from '@/components/ExpandableContent';
import {
  type ActivityEvent, type FubActivity, type FubPersonProfile,
  computeEngagementTrend, computeResponseMetrics, computeChannelPreference,
  computeMilestones, computeHealthScore, analyzePropertyInterest,
  computeActivityHeatmap, computeEngagementVelocity, computeCommunicationStyle,
  computeCadenceAnalysis, extractConversationTopics, computeReengagementMetrics,
  computeLifecyclePosition, computeOutreachEffectiveness, getRecentActivity,
  fmtK,
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
        .limit(200),
      supabase
        .from('fub_activity_log')
        .select('activity_type, subject, body_preview, direction, occurred_at, duration_seconds')
        .eq('entity_id', entityId)
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false })
        .limit(200),
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
        limit: 200,
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

      const importedFrom = entity?.importedFrom || entity?.imported_from;
      if (importedFrom?.startsWith('fub:')) {
        try {
          const fubPersonId = importedFrom.replace('fub:', '');
          const result = await callEdgeFunction('fub-activity', {
            fub_person_id: parseInt(fubPersonId),
            entity_id: entityId,
            limit: 200,
          });
          if (result?.personProfile) {
            setPersonProfile(result.personProfile as FubPersonProfile);
          }
          const { acts: newActs, fubs: newFubs } = await fetchLocalData();
          setActivities(newActs);
          setFubActivities(newFubs);
        } catch { /* non-critical */ }
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
    if (totalEvents < 5 && relationshipDuration > 30) risks.push('Very low engagement relative to relationship age');

    // Opportunities
    const opportunities: string[] = [];
    if (entityType === 'lead' && entity?.leadTemperature === 'hot') opportunities.push('Hot lead — prioritize immediate follow-up');
    if (entityType === 'deal' && entity?.stage === 'pending') opportunities.push('Deal pending close — stay attentive');
    if (daysSinceLastContact !== null && daysSinceLastContact <= 2 && totalEvents > 0) opportunities.push('Recently engaged — momentum is fresh');
    if (totalEvents >= 15) opportunities.push('Deep relationship — leverage for referrals');

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

    // All computed analytics
    const trend = computeEngagementTrend(activities, fubActivities);
    const response = computeResponseMetrics(fubActivities);
    const channel = computeChannelPreference(activities, fubActivities);
    const milestones = computeMilestones(activities, fubActivities, entity, entityType);
    const health = computeHealthScore(activities, fubActivities, entity, entityType);
    const propertyInterest = analyzePropertyInterest(fubActivities, personProfile, entity);
    const heatmap = computeActivityHeatmap(activities, fubActivities);
    const velocity = computeEngagementVelocity(activities, fubActivities);
    const commStyle = computeCommunicationStyle(fubActivities);
    const cadence = computeCadenceAnalysis(activities, fubActivities);
    const topics = extractConversationTopics(activities, fubActivities);
    const reengagement = computeReengagementMetrics(activities, fubActivities);
    const lifecycle = computeLifecyclePosition(entity, entityType);
    const outreach = computeOutreachEffectiveness(fubActivities);
    const recentActivity = getRecentActivity(activities, fubActivities);

    return {
      totalEvents, firstContact, lastContact, daysSinceLastContact,
      relationshipDuration, avgFrequency, risks, opportunities, nextAction,
      trend, response, channel, milestones, health, propertyInterest,
      heatmap, velocity, commStyle, cadence, topics, reengagement,
      lifecycle, outreach, recentActivity,
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

        {/* ═══ LIFECYCLE POSITION ═══ */}
        <LifecycleProgressBar lifecycle={insights.lifecycle} entityType={entityType} />

        {/* ═══ ENGAGEMENT VELOCITY ═══ */}
        <VelocityIndicator velocity={insights.velocity} />

        {/* ═══ PROPERTY INTEREST ANALYSIS (PROMINENT) ═══ */}
        {hasPropertyData && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-primary">
              <Home className="h-3.5 w-3.5" /> Property Interest Profile
            </p>

            <div className="grid grid-cols-2 gap-2">
              {pi.priceRange && <InfoChip icon={DollarSign} label="Budget" value={pi.priceRange} />}
              {pi.bedrooms && <InfoChip icon={Home} label="Beds / Bath" value={`${pi.bedrooms} BR${pi.bathrooms ? ` / ${pi.bathrooms} BA` : ''}`} />}
              {pi.timeFrame && <InfoChip icon={Calendar} label="Timeline" value={pi.timeFrame} />}
              {pi.preApproved != null && (
                <InfoChip icon={Shield} label="Pre-approved" value={pi.preApproved ? (pi.preApprovalAmount ? `Yes — $${fmtK(pi.preApprovalAmount)}` : 'Yes') : 'No'} />
              )}
              {pi.stage && <InfoChip icon={User} label="FUB Stage" value={pi.stage} />}
              {pi.source && <InfoChip icon={ArrowDownLeft} label="Source" value={pi.source} />}
              {pi.squareFeet && <InfoChip icon={LayoutGrid} label="Sq Ft" value={`${pi.squareFeet.toLocaleString()} sqft`} />}
              {pi.zipCode && <InfoChip icon={MapPin} label="ZIP" value={pi.zipCode} />}
            </div>

            {pi.locations.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Areas of Interest
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pi.locations.map((loc, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{loc}</span>
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
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Duration" value={insights.relationshipDuration > 0 ? `${insights.relationshipDuration}d` : '—'} />
          <StatBox label="Last Contact" value={insights.daysSinceLastContact !== null ? `${insights.daysSinceLastContact}d ago` : '—'} />
          <StatBox label="Avg Gap" value={insights.avgFrequency ? `${insights.avgFrequency}d` : '—'} />
          <StatBox label="Total" value={`${insights.totalEvents}`} />
        </div>

        {/* ═══ ENGAGEMENT TREND SPARKLINE ═══ */}
        {insights.totalEvents > 0 && (
          <Section icon={BarChart3} label="Engagement Trend (12 weeks)">
            <Sparkline data={insights.trend} />
          </Section>
        )}

        {/* ═══ ACTIVITY HEATMAP ═══ */}
        {insights.totalEvents > 2 && (
          <Section icon={LayoutGrid} label="Activity Heatmap">
            <ActivityHeatmap heatmap={insights.heatmap} />
          </Section>
        )}

        {/* ═══ RESPONSE METRICS ═══ */}
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
            <div className="grid grid-cols-2 gap-2 mt-2">
              <MiniStat icon={ArrowUpRight} label="Sent" value={`${insights.response.totalOutbound}`} />
              <MiniStat icon={ArrowDownLeft} label="Received" value={`${insights.response.totalInbound}`} />
              {insights.response.avgResponseGapDays !== null && (
                <MiniStat icon={Timer} label="Avg reply" value={`${insights.response.avgResponseGapDays}d`} />
              )}
              {insights.response.fastestReplyDays !== null && (
                <MiniStat icon={Zap} label="Fastest" value={`${insights.response.fastestReplyDays}d`} />
              )}
              {insights.response.longestStreak > 1 && (
                <MiniStat icon={AlertTriangle} label="Max unanswered" value={`${insights.response.longestStreak}`} />
              )}
            </div>
          </Section>
        )}

        {/* ═══ OUTREACH EFFECTIVENESS ═══ */}
        {insights.outreach.channels.length > 0 && (
          <Section icon={Target} label="Outreach Effectiveness by Channel">
            <div className="space-y-1.5">
              {insights.outreach.channels.map(ch => (
                <div key={ch.channel} className="flex items-center gap-2">
                  <span className="text-[11px] w-12 text-right font-medium">{ch.channel}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${ch.rate}%`,
                        backgroundColor: ch.rate >= 50 ? 'hsl(var(--primary))' : ch.rate >= 25 ? 'hsl(var(--warning, 45 93% 47%))' : 'hsl(var(--destructive))',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-16 text-right">{ch.replied}/{ch.sent} ({ch.rate}%)</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">{insights.outreach.insight}</p>
          </Section>
        )}

        {/* ═══ CHANNEL PREFERENCE ═══ */}
        {insights.channel.channels.length > 0 && (
          <Section icon={Phone} label="Channel Breakdown">
            <p className="text-xs text-muted-foreground mb-2">{insights.channel.insight}</p>
            <div className="space-y-1">
              {insights.channel.channels.map(ch => (
                <div key={ch.channel} className="flex items-center gap-2">
                  <span className="text-[11px] w-12 text-right">{channelIcon(ch.channel)} {ch.channel}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${ch.pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-20 text-right">
                    {ch.count} ({ch.pct}%)
                    {ch.inboundCount > 0 && <span className="text-primary ml-1">↓{ch.inboundCount}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ COMMUNICATION STYLE ═══ */}
        {insights.commStyle.totalMessages > 0 || insights.commStyle.totalCallMinutes > 0 ? (
          <Section icon={MessageCircle} label="Communication Style">
            <p className="text-xs text-muted-foreground mb-2">{insights.commStyle.style}</p>
            <div className="grid grid-cols-2 gap-2">
              {insights.commStyle.totalCallMinutes > 0 && (
                <MiniStat icon={Phone} label="Total talk time" value={`${insights.commStyle.totalCallMinutes}m`} />
              )}
              {insights.commStyle.avgCallDurationMin != null && (
                <MiniStat icon={Timer} label="Avg call" value={`${insights.commStyle.avgCallDurationMin}m`} />
              )}
              {insights.commStyle.longestCallMin != null && (
                <MiniStat icon={TrendingUp} label="Longest call" value={`${insights.commStyle.longestCallMin}m`} />
              )}
              {insights.commStyle.avgMessageLength != null && (
                <MiniStat icon={FileText} label="Avg msg length" value={`${insights.commStyle.avgMessageLength} chars`} />
              )}
            </div>
            {/* Direction balance */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Outbound</span>
                <span>Inbound</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full bg-primary/70 transition-all" style={{ width: `${insights.commStyle.directionalBalance}%` }} />
                <div className="h-full bg-accent transition-all" style={{ width: `${100 - insights.commStyle.directionalBalance}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                {insights.commStyle.preferredDirection === 'mostly_outbound' && "You're doing most of the reaching out"}
                {insights.commStyle.preferredDirection === 'balanced' && 'Good two-way communication balance'}
                {insights.commStyle.preferredDirection === 'mostly_inbound' && "They're reaching out more than you"}
              </p>
            </div>
          </Section>
        ) : null}

        {/* ═══ CONTACT CADENCE ═══ */}
        {insights.cadence.avgDaysBetweenTouches != null && (
          <Section icon={Repeat} label="Contact Cadence">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <StatBox label="Avg Gap" value={`${insights.cadence.avgDaysBetweenTouches}d`} />
              <StatBox label="Median" value={`${insights.cadence.medianDaysBetweenTouches}d`} />
              <StatBox label="Consistency" value={`${insights.cadence.consistencyScore}%`} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={`text-[10px] ${
                insights.cadence.consistency === 'very_consistent' ? 'text-primary border-primary/30' :
                insights.cadence.consistency === 'consistent' ? 'text-primary border-primary/30' :
                insights.cadence.consistency === 'irregular' ? 'text-warning border-warning/30' :
                'text-destructive border-destructive/30'
              }`}>
                {insights.cadence.consistency.replace('_', ' ')}
              </Badge>
              {insights.cadence.minGap !== null && (
                <span className="text-[10px] text-muted-foreground">
                  Range: {insights.cadence.minGap}d – {insights.cadence.maxGap}d
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{insights.cadence.recommendation}</p>
            {/* Gap distribution */}
            {insights.cadence.gapDistribution.length > 0 && (
              <div className="mt-2 space-y-1">
                {insights.cadence.gapDistribution.map(gd => {
                  const maxCount = Math.max(...insights.cadence.gapDistribution.map(g => g.count));
                  return (
                    <div key={gd.label} className="flex items-center gap-2">
                      <span className="text-[10px] w-20 text-right text-muted-foreground">{gd.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${(gd.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-6">{gd.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* ═══ CONVERSATION TOPICS ═══ */}
        {insights.topics.length > 0 && (
          <Section icon={FileText} label="Conversation Topics">
            <ExpandableContent maxHeight={120}>
              <div className="space-y-1">
                {insights.topics.slice(0, 15).map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${
                      t.category === 'property' ? 'bg-primary/10 text-primary' :
                      t.category === 'financial' ? 'bg-accent text-accent-foreground' :
                      t.category === 'timing' ? 'bg-secondary text-secondary-foreground' :
                      t.category === 'concern' ? 'bg-destructive/10 text-destructive' :
                      t.category === 'action' ? 'bg-muted text-muted-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>{t.category}</span>
                    <span className="text-[11px] flex-1">{t.topic}</span>
                    <span className="text-[10px] text-muted-foreground">{t.mentions}×</span>
                  </div>
                ))}
              </div>
            </ExpandableContent>
          </Section>
        )}

        {/* ═══ RE-ENGAGEMENT METRICS ═══ */}
        {insights.reengagement.totalGaps > 0 && (
          <Section icon={Repeat} label="Re-engagement Success">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <StatBox label="Gaps (7d+)" value={`${insights.reengagement.totalGaps}`} />
              <StatBox label="Re-engaged" value={`${insights.reengagement.successfulReengagements}`} />
              <StatBox label="Success Rate" value={`${insights.reengagement.successRate}%`} />
            </div>
            <p className="text-[10px] text-muted-foreground">{insights.reengagement.insight}</p>
          </Section>
        )}

        {/* ═══ KEY MILESTONES ═══ */}
        {insights.milestones.length > 0 && (
          <Section icon={Calendar} label="Key Milestones">
            <ExpandableContent maxHeight={120}>
              <div className="relative pl-3 space-y-1.5">
                <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
                {insights.milestones.map((m, i) => (
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
            </ExpandableContent>
          </Section>
        )}

        {/* ═══ RECENT ACTIVITY LOG ═══ */}
        {insights.recentActivity.length > 0 && (
          <Section icon={Activity} label="Recent Activity">
            <ExpandableContent maxHeight={140}>
              <div className="space-y-1.5">
                {insights.recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground w-16 text-right flex-shrink-0">{item.dayLabel}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      item.direction === 'inbound' ? 'bg-primary' : 'bg-muted-foreground'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{channelIcon(item.channel)} {item.channel}</span>
                      {item.direction && <span className="text-muted-foreground ml-1">({item.direction})</span>}
                      {item.subject && (
                        <p className="text-muted-foreground truncate text-[10px]">{item.subject}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableContent>
          </Section>
        )}

        {/* ═══ RECOMMENDED ACTION ═══ */}
        <Section icon={Target} label="Recommended Next Action" accent>
          <p className="text-sm">{insights.nextAction}</p>
          {insights.lifecycle.actionToAdvance && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ArrowRight className="h-3 w-3" /> {insights.lifecycle.actionToAdvance}
            </p>
          )}
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
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${health.score}%`, backgroundColor: colorMap[health.color] }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {health.factors.map((f, i) => (
          <span key={i} className="text-[9px] text-muted-foreground">{f}</span>
        ))}
      </div>
    </div>
  );
}

function LifecycleProgressBar({ lifecycle, entityType }: { lifecycle: ReturnType<typeof computeLifecyclePosition>; entityType: string }) {
  const stages = entityType === 'deal'
    ? ['Offer', 'Pending', 'Contract', 'Closing', 'Closed']
    : ['Cold', 'Warm', 'Hot', 'Converting', 'Won'];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Compass className="h-3 w-3" /> Lifecycle — {lifecycle.phase}
        </p>
        <span className="text-[10px] text-muted-foreground">{lifecycle.daysInPhase}d in phase</span>
      </div>
      <div className="flex gap-1">
        {stages.map((stage, i) => (
          <div key={stage} className="flex-1">
            <div className={`h-2 rounded-full transition-all ${
              i < lifecycle.phaseIndex ? 'bg-primary' :
              i === lifecycle.phaseIndex ? 'bg-primary/60' : 'bg-muted'
            }`} />
            <p className="text-[8px] text-center text-muted-foreground mt-0.5">{stage}</p>
          </div>
        ))}
      </div>
      {lifecycle.nextPhase && (
        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          <ArrowRight className="h-3 w-3" /> Next: {lifecycle.nextPhase}
        </p>
      )}
    </div>
  );
}

function VelocityIndicator({ velocity }: { velocity: ReturnType<typeof computeEngagementVelocity> }) {
  const icons = {
    accelerating: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
    steady: <Gauge className="h-3.5 w-3.5 text-muted-foreground" />,
    decelerating: <TrendingUp className="h-3.5 w-3.5 text-destructive rotate-180" />,
    stalled: <Snowflake className="h-3.5 w-3.5 text-destructive" />,
    insufficient: <Activity className="h-3.5 w-3.5 text-muted-foreground" />,
  };
  const colors = {
    accelerating: 'text-primary',
    steady: 'text-muted-foreground',
    decelerating: 'text-destructive',
    stalled: 'text-destructive',
    insufficient: 'text-muted-foreground',
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background/50 px-3 py-2">
      {icons[velocity.trend]}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold capitalize ${colors[velocity.trend]}`}>
            {velocity.trend === 'insufficient' ? 'Building data' : velocity.trend}
          </span>
          {velocity.changePercent !== 0 && velocity.trend !== 'insufficient' && (
            <Badge variant="outline" className={`text-[9px] ${velocity.changePercent > 0 ? 'text-primary' : 'text-destructive'}`}>
              {velocity.changePercent > 0 ? '+' : ''}{velocity.changePercent}%
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{velocity.description}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold">{velocity.recentRate.toFixed(1)}</p>
        <p className="text-[9px] text-muted-foreground">per wk</p>
      </div>
    </div>
  );
}

function ActivityHeatmap({ heatmap }: { heatmap: ReturnType<typeof computeActivityHeatmap> }) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeLabels = ['AM', 'PM', 'Eve'];
  const maxCount = Math.max(...heatmap.cells.map(c => c.count), 1);

  return (
    <div>
      <div className="grid grid-cols-8 gap-px">
        <div /> {/* top-left corner */}
        {dayNames.map(d => <span key={d} className="text-[8px] text-center text-muted-foreground">{d}</span>)}
        {(['morning', 'afternoon', 'evening'] as const).map((time, ti) => (
          <React.Fragment key={time}>
            <span className="text-[8px] text-muted-foreground text-right pr-1 flex items-center justify-end">{timeLabels[ti]}</span>
            {[0, 1, 2, 3, 4, 5, 6].map(day => {
              const cell = heatmap.cells.find(c => c.day === day && c.hour === time);
              const intensity = cell ? cell.count / maxCount : 0;
              return (
                <div
                  key={`${day}-${time}`}
                  className="aspect-square rounded-sm transition-colors"
                  style={{
                    backgroundColor: intensity > 0
                      ? `hsl(var(--primary) / ${Math.max(intensity * 0.9, 0.1)})`
                      : 'hsl(var(--muted))',
                  }}
                  title={`${dayNames[day]} ${time}: ${cell?.count || 0}`}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        {heatmap.bestDay && (
          <span className="text-[10px] text-muted-foreground">Best day: <span className="font-medium text-foreground">{heatmap.bestDay}</span></span>
        )}
        {heatmap.bestTime && (
          <span className="text-[10px] text-muted-foreground">Best time: <span className="font-medium text-foreground">{heatmap.bestTime}</span></span>
        )}
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
    <div className="rounded-md border border-border bg-background/50 px-2 py-1.5 text-center">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span>{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
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
