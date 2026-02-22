import { differenceInDays, differenceInWeeks, differenceInHours, format, startOfWeek, getDay, getHours } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────
export interface ActivityEvent {
  touch_type: string;
  note: string | null;
  created_at: string;
}

export interface FubActivity {
  activity_type: string;
  subject: string | null;
  body_preview: string | null;
  direction: string | null;
  occurred_at: string;
  duration_seconds?: number | null;
}

export interface FubPersonProfile {
  tags?: string[];
  addresses?: Array<{ type?: string; street?: string; city?: string; state?: string; code?: string }>;
  stage?: string | null;
  source?: string | null;
  created?: string | null;
  lastActivity?: string | null;
  price?: number | null;
  priceRangeLow?: number | null;
  priceRangeHigh?: number | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  timeFrame?: string | null;
  preApproved?: boolean | null;
  preApprovalAmount?: number | null;
  background?: string | null;
  customFields?: Array<{ name: string; value: unknown }>;
  cities?: string | string[] | null;
  state?: string | null;
  zipCode?: string | null;
}

// ── 1. Engagement Trend (weekly buckets for sparkline) ──────────────
export interface WeekBucket {
  week: string; // 'MMM d'
  count: number;
}

export function computeEngagementTrend(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
  weeks = 12,
): WeekBucket[] {
  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ];

  const now = new Date();
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = startOfWeek(new Date(now.getTime() - i * 7 * 86400000));
    buckets.push({ week: format(weekStart, 'MMM d'), count: 0 });
  }

  for (const d of allDates) {
    const weeksAgo = differenceInWeeks(now, d);
    const idx = weeks - 1 - weeksAgo;
    if (idx >= 0 && idx < weeks) {
      buckets[idx].count++;
    }
  }

  return buckets;
}

// ── 2. Response Rate & Ratio ────────────────────────────────────────
export interface ResponseMetrics {
  totalOutbound: number;
  totalInbound: number;
  responseRatio: number; // 0-100
  avgResponseGapDays: number | null;
  label: string;
  longestStreak: number; // consecutive outbound with no reply
  fastestReplyDays: number | null;
  slowestReplyDays: number | null;
}

export function computeResponseMetrics(fubActivities: FubActivity[]): ResponseMetrics {
  let inbound = 0;
  let outbound = 0;
  fubActivities.forEach(a => {
    if (a.direction === 'inbound') inbound++;
    else if (a.direction === 'outbound') outbound++;
  });

  const ratio = outbound > 0 ? Math.round((inbound / outbound) * 100) : inbound > 0 ? 100 : 0;

  const sorted = [...fubActivities].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const gaps: number[] = [];
  let currentStreak = 0;
  let longestStreak = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].direction === 'outbound' && sorted[i + 1].direction === 'inbound') {
      const gap = differenceInDays(new Date(sorted[i + 1].occurred_at), new Date(sorted[i].occurred_at));
      if (gap >= 0 && gap < 60) gaps.push(gap);
      currentStreak = 0;
    } else if (sorted[i].direction === 'outbound') {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const fastestReplyDays = gaps.length > 0 ? Math.min(...gaps) : null;
  const slowestReplyDays = gaps.length > 0 ? Math.max(...gaps) : null;

  let label = 'No data';
  if (ratio >= 80) label = 'Highly responsive';
  else if (ratio >= 50) label = 'Good engagement';
  else if (ratio >= 25) label = 'Moderate engagement';
  else if (outbound > 0) label = 'Low responsiveness';

  return { totalOutbound: outbound, totalInbound: inbound, responseRatio: ratio, avgResponseGapDays: avgGap, label, longestStreak, fastestReplyDays, slowestReplyDays };
}

// ── 3. Channel Preference ───────────────────────────────────────────
export interface ChannelPreference {
  channel: string;
  count: number;
  pct: number;
  inboundCount: number;
}

export function computeChannelPreference(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): { channels: ChannelPreference[]; bestChannel: string | null; insight: string } {
  const counts: Record<string, { total: number; inbound: number }> = {};

  activities.forEach(a => {
    const ch = normalizeChannel(a.touch_type);
    if (!counts[ch]) counts[ch] = { total: 0, inbound: 0 };
    counts[ch].total++;
  });

  fubActivities.forEach(a => {
    const ch = normalizeChannel(a.activity_type);
    if (!counts[ch]) counts[ch] = { total: 0, inbound: 0 };
    counts[ch].total++;
    if (a.direction === 'inbound') counts[ch].inbound++;
  });

  const total = Object.values(counts).reduce((s, c) => s + c.total, 0);
  const channels: ChannelPreference[] = Object.entries(counts)
    .map(([channel, c]) => ({
      channel,
      count: c.total,
      pct: total > 0 ? Math.round((c.total / total) * 100) : 0,
      inboundCount: c.inbound,
    }))
    .sort((a, b) => b.count - a.count);

  const bestByInbound = channels.filter(c => c.inboundCount > 0).sort((a, b) => b.inboundCount - a.inboundCount)[0];
  const bestChannel = bestByInbound?.channel || channels[0]?.channel || null;

  let insight = 'Not enough data to determine preferred channel.';
  if (bestByInbound && bestByInbound.inboundCount >= 2) {
    insight = `They respond most via ${bestByInbound.channel} (${bestByInbound.inboundCount} inbound). Use this channel for higher engagement.`;
  } else if (channels.length > 0) {
    insight = `Most contact via ${channels[0].channel}. Try varying channels to see what gets responses.`;
  }

  return { channels, bestChannel, insight };
}

function normalizeChannel(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('call') || t.includes('phone')) return 'Call';
  if (t.includes('email') || t.includes('mail')) return 'Email';
  if (t.includes('text') || t.includes('sms') || t.includes('message')) return 'Text';
  if (t.includes('meeting') || t.includes('showing') || t.includes('visit')) return 'Meeting';
  if (t.includes('note')) return 'Note';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ── 4. Key Milestones Timeline ──────────────────────────────────────
export interface Milestone {
  date: Date;
  label: string;
  type: 'first_contact' | 'stage_change' | 'appointment' | 'deal' | 'inbound_spike' | 'gap';
}

export function computeMilestones(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
  entity: any,
  entityType: string,
): Milestone[] {
  const milestones: Milestone[] = [];

  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ].sort((a, b) => a.getTime() - b.getTime());

  if (allDates.length > 0) {
    milestones.push({ date: allDates[0], label: 'First contact', type: 'first_contact' });
  }

  if (entity?.created_at) {
    milestones.push({ date: new Date(entity.created_at), label: `${entityType === 'lead' ? 'Lead' : 'Deal'} created`, type: 'stage_change' });
  }

  if (entity?.converted_at) {
    milestones.push({ date: new Date(entity.converted_at), label: 'Converted', type: 'stage_change' });
  }

  if (entityType === 'deal') {
    if (entity?.closed_at) milestones.push({ date: new Date(entity.closed_at), label: 'Deal closed', type: 'deal' });
    if (entity?.close_date) milestones.push({ date: new Date(entity.close_date), label: 'Expected close', type: 'deal' });
  }

  // Detect large gaps (>14 days)
  for (let i = 1; i < allDates.length; i++) {
    const gap = differenceInDays(allDates[i], allDates[i - 1]);
    if (gap > 14) {
      milestones.push({ date: allDates[i], label: `${gap}-day gap ended`, type: 'gap' });
    }
  }

  return milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── 5. Relationship Health Score (0-100) ────────────────────────────
export interface HealthScore {
  score: number;
  label: string;
  color: 'red' | 'amber' | 'green';
  factors: string[];
}

export function computeHealthScore(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
  entity: any,
  entityType: string,
): HealthScore {
  let score = 50;
  const factors: string[] = [];
  const totalEvents = activities.length + fubActivities.length;

  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ].sort((a, b) => a.getTime() - b.getTime());

  const lastDate = allDates[allDates.length - 1];
  const daysSinceLast = lastDate ? differenceInDays(new Date(), lastDate) : null;

  if (daysSinceLast !== null) {
    if (daysSinceLast <= 2) { score += 15; factors.push('+15 Recent contact'); }
    else if (daysSinceLast <= 7) { score += 5; factors.push('+5 Active this week'); }
    else if (daysSinceLast > 14) { score -= 20; factors.push('-20 No contact 14+ days'); }
    else if (daysSinceLast > 7) { score -= 10; factors.push('-10 Going quiet'); }
  } else {
    score -= 25; factors.push('-25 No activity history');
  }

  if (totalEvents >= 20) { score += 15; factors.push('+15 Deep relationship'); }
  else if (totalEvents >= 10) { score += 10; factors.push('+10 Good engagement volume'); }
  else if (totalEvents >= 5) { score += 5; factors.push('+5 Some engagement'); }
  else if (totalEvents < 3) { score -= 10; factors.push('-10 Minimal interaction'); }

  let inbound = 0, outbound = 0;
  fubActivities.forEach(a => {
    if (a.direction === 'inbound') inbound++;
    else if (a.direction === 'outbound') outbound++;
  });
  if (outbound > 3 && inbound === 0) { score -= 15; factors.push('-15 No responses detected'); }
  else if (inbound > outbound && totalEvents > 3) { score += 10; factors.push('+10 Strong inbound engagement'); }
  else if (inbound > 0 && outbound > 0) { score += 5; factors.push('+5 Two-way communication'); }

  if (entityType === 'lead' && entity?.leadTemperature === 'hot') { score += 10; factors.push('+10 Hot lead'); }
  if (entityType === 'lead' && entity?.leadTemperature === 'cold' && totalEvents < 5) { score -= 10; factors.push('-10 Cold with low activity'); }
  if (entityType === 'deal' && entity?.riskLevel === 'red') { score -= 15; factors.push('-15 High-risk deal'); }

  score = Math.max(0, Math.min(100, score));

  let label = 'Needs Attention';
  let color: 'red' | 'amber' | 'green' = 'red';
  if (score >= 70) { label = 'Strong'; color = 'green'; }
  else if (score >= 40) { label = 'Moderate'; color = 'amber'; }

  return { score, label, color, factors };
}

// ── 6. Property Interest Analysis ───────────────────────────────────
export interface PropertyInterest {
  priceRange: string | null;
  propertyTypes: string[];
  locations: string[];
  bedrooms: string | null;
  bathrooms: string | null;
  timeFrame: string | null;
  preApproved: boolean | null;
  preApprovalAmount: number | null;
  tags: string[];
  extractedKeywords: string[];
  currentAddress: string | null;
  stage: string | null;
  source: string | null;
  background: string | null;
  squareFeet: number | null;
  zipCode: string | null;
}

export function analyzePropertyInterest(
  fubActivities: FubActivity[],
  personProfile: FubPersonProfile | null,
  entity: any,
): PropertyInterest {
  const result: PropertyInterest = {
    priceRange: null, propertyTypes: [], locations: [], bedrooms: null,
    bathrooms: null, timeFrame: null, preApproved: null, preApprovalAmount: null,
    tags: [], extractedKeywords: [], currentAddress: null, stage: null,
    source: null, background: null, squareFeet: null, zipCode: null,
  };

  if (!personProfile && fubActivities.length === 0) return result;

  if (personProfile) {
    result.stage = personProfile.stage || null;
    result.source = personProfile.source || null;
    result.background = personProfile.background || null;
    result.tags = (personProfile.tags || []).filter(Boolean);
    result.squareFeet = personProfile.squareFeet || null;
    result.zipCode = personProfile.zipCode || null;

    if (personProfile.price || personProfile.priceRangeLow || personProfile.priceRangeHigh) {
      const low = personProfile.priceRangeLow || personProfile.price;
      const high = personProfile.priceRangeHigh || personProfile.price;
      if (low && high && low !== high) {
        result.priceRange = `$${fmtK(low)} – $${fmtK(high)}`;
      } else if (low || high) {
        result.priceRange = `~$${fmtK(low || high!)}`;
      }
    }

    if (personProfile.propertyType) result.propertyTypes.push(personProfile.propertyType);
    if (personProfile.bedrooms) result.bedrooms = `${personProfile.bedrooms}`;
    if (personProfile.bathrooms) result.bathrooms = `${personProfile.bathrooms}`;
    if (personProfile.timeFrame) result.timeFrame = personProfile.timeFrame;
    if (personProfile.preApproved != null) result.preApproved = personProfile.preApproved;
    if (personProfile.preApprovalAmount) result.preApprovalAmount = personProfile.preApprovalAmount;

    const addresses = personProfile.addresses || [];
    for (const addr of addresses) {
      if (addr.city || addr.state) {
        const loc = [addr.city, addr.state].filter(Boolean).join(', ');
        if (!result.locations.includes(loc)) result.locations.push(loc);
      }
      if (addr.type === 'home' && addr.street) {
        result.currentAddress = [addr.street, addr.city, addr.state, addr.code].filter(Boolean).join(', ');
      }
    }

    if (personProfile.cities) {
      const cities = Array.isArray(personProfile.cities) ? personProfile.cities : [personProfile.cities];
      for (const c of cities) {
        if (c && !result.locations.includes(c)) result.locations.push(c);
      }
    }
    if (personProfile.state && result.locations.length === 0) {
      result.locations.push(personProfile.state);
    }

    if (personProfile.customFields) {
      for (const cf of personProfile.customFields) {
        const name = (cf.name || '').toLowerCase();
        const val = cf.value != null ? String(cf.value) : '';
        if (!val) continue;

        if (name.includes('property') || name.includes('type') || name.includes('home')) {
          if (!result.propertyTypes.includes(val)) result.propertyTypes.push(val);
        }
        if (name.includes('city') || name.includes('area') || name.includes('neighborhood') || name.includes('location')) {
          if (!result.locations.includes(val)) result.locations.push(val);
        }
        if (name.includes('price') || name.includes('budget')) {
          if (!result.priceRange) result.priceRange = val;
        }
        if (name.includes('bedroom') || name.includes('bed')) {
          if (!result.bedrooms) result.bedrooms = val;
        }
        if (name.includes('timeline') || name.includes('time frame') || name.includes('when')) {
          if (!result.timeFrame) result.timeFrame = val;
        }
      }
    }
  }

  const notes = entity?.notes || '';
  if (notes) extractPropertyKeywords(notes, result);

  const textCorpus = fubActivities
    .map(a => [a.subject, a.body_preview].filter(Boolean).join(' '))
    .join(' ');
  if (textCorpus.length > 20) extractPropertyKeywords(textCorpus, result);

  for (const tag of result.tags) {
    const tl = tag.toLowerCase();
    if (tl.includes('buyer')) result.extractedKeywords.push('Buyer');
    if (tl.includes('seller')) result.extractedKeywords.push('Seller');
    if (tl.includes('investor')) result.extractedKeywords.push('Investor');
    if (tl.includes('renter') || tl.includes('rental')) result.extractedKeywords.push('Renter');
    if (tl.includes('first time') || tl.includes('first-time')) result.extractedKeywords.push('First-time buyer');
    if (tl.includes('relocation') || tl.includes('relocat')) result.extractedKeywords.push('Relocation');
    if (tl.includes('luxury')) result.extractedKeywords.push('Luxury');
    if (tl.includes('condo')) { if (!result.propertyTypes.includes('Condo')) result.propertyTypes.push('Condo'); }
    if (tl.includes('townhouse') || tl.includes('townhome')) { if (!result.propertyTypes.includes('Townhouse')) result.propertyTypes.push('Townhouse'); }
    if (tl.includes('single family') || tl.includes('single-family') || tl.includes('sfr')) { if (!result.propertyTypes.includes('Single Family')) result.propertyTypes.push('Single Family'); }
  }

  result.extractedKeywords = [...new Set(result.extractedKeywords)];
  result.propertyTypes = [...new Set(result.propertyTypes)];
  result.locations = [...new Set(result.locations)];

  return result;
}

// ── 7. Activity Heatmap (day of week × time of day) ─────────────────
export interface HeatmapCell {
  day: number; // 0=Sun, 6=Sat
  hour: 'morning' | 'afternoon' | 'evening';
  count: number;
}

export function computeActivityHeatmap(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): { cells: HeatmapCell[]; bestDay: string | null; bestTime: string | null } {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const grid: Record<string, number> = {};
  const dayCounts: Record<number, number> = {};
  const timeCounts: Record<string, number> = {};

  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ];

  for (const d of allDates) {
    const day = getDay(d);
    const h = getHours(d);
    const timeBucket = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const key = `${day}-${timeBucket}`;
    grid[key] = (grid[key] || 0) + 1;
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    timeCounts[timeBucket] = (timeCounts[timeBucket] || 0) + 1;
  }

  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (const hour of ['morning', 'afternoon', 'evening'] as const) {
      cells.push({ day, hour, count: grid[`${day}-${hour}`] || 0 });
    }
  }

  const bestDayEntry = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
  const bestTimeEntry = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    cells,
    bestDay: bestDayEntry ? dayNames[parseInt(bestDayEntry[0])] : null,
    bestTime: bestTimeEntry ? bestTimeEntry[0] : null,
  };
}

// ── 8. Engagement Velocity ──────────────────────────────────────────
export interface EngagementVelocity {
  trend: 'accelerating' | 'steady' | 'decelerating' | 'stalled' | 'insufficient';
  recentRate: number; // events per week (last 4 weeks)
  priorRate: number; // events per week (prior 4 weeks)
  changePercent: number;
  description: string;
}

export function computeEngagementVelocity(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): EngagementVelocity {
  const now = new Date();
  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ];

  const recent = allDates.filter(d => differenceInDays(now, d) <= 28).length;
  const prior = allDates.filter(d => {
    const days = differenceInDays(now, d);
    return days > 28 && days <= 56;
  }).length;

  const recentRate = recent / 4;
  const priorRate = prior / 4;

  if (recent + prior < 3) {
    return { trend: 'insufficient', recentRate, priorRate, changePercent: 0, description: 'Not enough data to measure velocity.' };
  }

  const change = priorRate > 0 ? Math.round(((recentRate - priorRate) / priorRate) * 100) : recentRate > 0 ? 100 : 0;

  let trend: EngagementVelocity['trend'] = 'steady';
  let description = 'Engagement is steady — maintaining consistent cadence.';

  if (recentRate === 0) {
    trend = 'stalled';
    description = 'Engagement has stalled — no activity in the past 4 weeks.';
  } else if (change >= 30) {
    trend = 'accelerating';
    description = `Engagement is accelerating (+${change}%) — momentum is building.`;
  } else if (change <= -30) {
    trend = 'decelerating';
    description = `Engagement is decelerating (${change}%) — attention needed.`;
  }

  return { trend, recentRate, priorRate, changePercent: change, description };
}

// ── 9. Communication Style Analysis ─────────────────────────────────
export interface CommunicationStyle {
  avgCallDurationMin: number | null;
  totalCallMinutes: number;
  longestCallMin: number | null;
  avgMessageLength: number | null;
  totalMessages: number;
  preferredDirection: 'mostly_outbound' | 'balanced' | 'mostly_inbound' | 'unknown';
  directionalBalance: number; // 0-100, 50 = balanced
  style: string;
}

export function computeCommunicationStyle(fubActivities: FubActivity[]): CommunicationStyle {
  const calls = fubActivities.filter(a => normalizeChannel(a.activity_type) === 'Call');
  const durations = calls.map(c => c.duration_seconds).filter((d): d is number => d != null && d > 0);
  const totalCallSec = durations.reduce((s, d) => s + d, 0);
  const avgCallSec = durations.length > 0 ? totalCallSec / durations.length : 0;
  const longestCall = durations.length > 0 ? Math.max(...durations) : null;

  const messages = fubActivities.filter(a => a.body_preview && a.body_preview.length > 0);
  const lengths = messages.map(m => m.body_preview!.length);
  const avgLen = lengths.length > 0 ? Math.round(lengths.reduce((s, l) => s + l, 0) / lengths.length) : null;

  let inbound = 0, outbound = 0;
  fubActivities.forEach(a => {
    if (a.direction === 'inbound') inbound++;
    else if (a.direction === 'outbound') outbound++;
  });

  const total = inbound + outbound;
  const balance = total > 0 ? Math.round((outbound / total) * 100) : 50;
  let preferredDirection: CommunicationStyle['preferredDirection'] = 'unknown';
  if (total > 2) {
    if (balance >= 70) preferredDirection = 'mostly_outbound';
    else if (balance <= 30) preferredDirection = 'mostly_inbound';
    else preferredDirection = 'balanced';
  }

  let style = 'Not enough data to determine communication style.';
  if (calls.length >= 5 && messages.length < 3) {
    style = 'Phone-first communicator — prefers voice over text.';
  } else if (messages.length >= 5 && calls.length < 3) {
    style = 'Text-heavy communicator — prefers written messages.';
  } else if (calls.length >= 3 && messages.length >= 3) {
    style = 'Multi-channel communicator — uses both calls and messages.';
  }

  return {
    avgCallDurationMin: avgCallSec > 0 ? Math.round(avgCallSec / 60 * 10) / 10 : null,
    totalCallMinutes: Math.round(totalCallSec / 60),
    longestCallMin: longestCall ? Math.round(longestCall / 60 * 10) / 10 : null,
    avgMessageLength: avgLen,
    totalMessages: messages.length,
    preferredDirection,
    directionalBalance: balance,
    style,
  };
}

// ── 10. Contact Cadence Analysis ────────────────────────────────────
export interface CadenceAnalysis {
  avgDaysBetweenTouches: number | null;
  medianDaysBetweenTouches: number | null;
  minGap: number | null;
  maxGap: number | null;
  consistency: 'very_consistent' | 'consistent' | 'irregular' | 'sporadic' | 'insufficient';
  consistencyScore: number; // 0-100
  recommendation: string;
  gapDistribution: { label: string; count: number }[];
}

export function computeCadenceAnalysis(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): CadenceAnalysis {
  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ].sort((a, b) => a.getTime() - b.getTime());

  if (allDates.length < 3) {
    return {
      avgDaysBetweenTouches: null, medianDaysBetweenTouches: null, minGap: null, maxGap: null,
      consistency: 'insufficient', consistencyScore: 0, recommendation: 'Need more interactions to analyze cadence.',
      gapDistribution: [],
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < allDates.length; i++) {
    gaps.push(differenceInDays(allDates[i], allDates[i - 1]));
  }

  const avg = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const minGap = sorted[0];
  const maxGap = sorted[sorted.length - 1];

  // Standard deviation for consistency
  const variance = gaps.reduce((s, g) => s + Math.pow(g - avg, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 0; // coefficient of variation

  let consistency: CadenceAnalysis['consistency'] = 'irregular';
  let consistencyScore = 50;

  if (cv <= 0.3) { consistency = 'very_consistent'; consistencyScore = 90; }
  else if (cv <= 0.6) { consistency = 'consistent'; consistencyScore = 70; }
  else if (cv <= 1.0) { consistency = 'irregular'; consistencyScore = 40; }
  else { consistency = 'sporadic'; consistencyScore = 20; }

  let recommendation = '';
  if (avg <= 3) recommendation = 'Great cadence — highly attentive. Make sure you\'re not overwhelming them.';
  else if (avg <= 7) recommendation = 'Good weekly rhythm. Maintain this pace.';
  else if (avg <= 14) recommendation = 'Bi-weekly cadence. Consider increasing for warmer leads.';
  else recommendation = `Average ${avg}-day gaps. Set a recurring reminder to stay in touch.`;

  // Gap distribution
  const gapDistribution = [
    { label: 'Same day', count: gaps.filter(g => g === 0).length },
    { label: '1–3 days', count: gaps.filter(g => g >= 1 && g <= 3).length },
    { label: '4–7 days', count: gaps.filter(g => g >= 4 && g <= 7).length },
    { label: '1–2 weeks', count: gaps.filter(g => g >= 8 && g <= 14).length },
    { label: '2–4 weeks', count: gaps.filter(g => g >= 15 && g <= 30).length },
    { label: '1+ month', count: gaps.filter(g => g > 30).length },
  ].filter(d => d.count > 0);

  return { avgDaysBetweenTouches: avg, medianDaysBetweenTouches: median, minGap, maxGap, consistency, consistencyScore, recommendation, gapDistribution };
}

// ── 11. Conversation Topics Extraction ──────────────────────────────
export interface TopicCluster {
  topic: string;
  mentions: number;
  category: 'property' | 'financial' | 'timing' | 'preference' | 'concern' | 'action';
}

export function extractConversationTopics(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): TopicCluster[] {
  const textCorpus = [
    ...activities.map(a => a.note || ''),
    ...fubActivities.map(a => [a.subject, a.body_preview].filter(Boolean).join(' ')),
  ].join(' ').toLowerCase();

  if (textCorpus.length < 30) return [];

  const topicPatterns: { pattern: RegExp; topic: string; category: TopicCluster['category'] }[] = [
    // Property topics
    { pattern: /\b(?:showing|tour|view|walkthrough|open house)\b/gi, topic: 'Property showings', category: 'property' },
    { pattern: /\b(?:offer|bid|submit|countered?)\b/gi, topic: 'Offers & negotiations', category: 'property' },
    { pattern: /\b(?:listing|list price|listed)\b/gi, topic: 'Listings', category: 'property' },
    { pattern: /\b(?:inspection|inspect|home inspection)\b/gi, topic: 'Inspection', category: 'property' },
    { pattern: /\b(?:appraisal|appraised)\b/gi, topic: 'Appraisal', category: 'property' },
    { pattern: /\b(?:renovati|remodel|update|upgrade|repair)\b/gi, topic: 'Renovation/updates', category: 'property' },
    { pattern: /\b(?:new construct|new build|builder)\b/gi, topic: 'New construction', category: 'property' },
    // Financial
    { pattern: /\b(?:mortgage|loan|financ|lender|rate)\b/gi, topic: 'Financing & mortgage', category: 'financial' },
    { pattern: /\b(?:pre[\s-]?approv|pre[\s-]?qual)\b/gi, topic: 'Pre-approval', category: 'financial' },
    { pattern: /\b(?:down payment|earnest|escrow)\b/gi, topic: 'Down payment/escrow', category: 'financial' },
    { pattern: /\b(?:budget|afford|price range)\b/gi, topic: 'Budget discussions', category: 'financial' },
    { pattern: /\b(?:closing cost|settlement)\b/gi, topic: 'Closing costs', category: 'financial' },
    // Timing
    { pattern: /\b(?:timeline|time frame|moving date|move[\s-]?in)\b/gi, topic: 'Timeline/move-in', category: 'timing' },
    { pattern: /\b(?:urgency|urgent|asap|quickly)\b/gi, topic: 'Urgency', category: 'timing' },
    { pattern: /\b(?:lease|rental|rent)\b/gi, topic: 'Lease/rental', category: 'timing' },
    // Preferences
    { pattern: /\b(?:school|district|education)\b/gi, topic: 'Schools/education', category: 'preference' },
    { pattern: /\b(?:commute|transit|transport)\b/gi, topic: 'Commute/transit', category: 'preference' },
    { pattern: /\b(?:neighbor|community|hoa)\b/gi, topic: 'Neighborhood/HOA', category: 'preference' },
    { pattern: /\b(?:yard|garage|parking|pool|patio)\b/gi, topic: 'Amenities', category: 'preference' },
    { pattern: /\b(?:pet|dog|cat)\b/gi, topic: 'Pet-friendly', category: 'preference' },
    // Concerns
    { pattern: /\b(?:concern|worried|issue|problem|hesitat)\b/gi, topic: 'Concerns/hesitations', category: 'concern' },
    { pattern: /\b(?:competitor|other agent|another)\b/gi, topic: 'Competition', category: 'concern' },
    { pattern: /\b(?:wait|not ready|hold off|delay)\b/gi, topic: 'Timing hesitation', category: 'concern' },
    // Actions
    { pattern: /\b(?:follow up|follow-up|check in|check-in|touch base)\b/gi, topic: 'Follow-ups', category: 'action' },
    { pattern: /\b(?:schedul|appointment|meeting|call)\b/gi, topic: 'Scheduling', category: 'action' },
    { pattern: /\b(?:send|sent|forward|attach|document|contract|paperwork)\b/gi, topic: 'Documents/paperwork', category: 'action' },
    { pattern: /\b(?:referr|recommend)\b/gi, topic: 'Referrals', category: 'action' },
  ];

  const clusters: TopicCluster[] = [];
  for (const { pattern, topic, category } of topicPatterns) {
    const matches = textCorpus.match(pattern);
    if (matches && matches.length > 0) {
      clusters.push({ topic, mentions: matches.length, category });
    }
  }

  return clusters.sort((a, b) => b.mentions - a.mentions);
}

// ── 12. Re-engagement Success Rate ──────────────────────────────────
export interface ReengagementMetrics {
  totalGaps: number;
  successfulReengagements: number;
  failedReengagements: number;
  successRate: number;
  avgGapLength: number | null;
  insight: string;
}

export function computeReengagementMetrics(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
): ReengagementMetrics {
  const allEvents = [
    ...activities.map(a => ({ date: new Date(a.created_at), direction: 'outbound' as const })),
    ...fubActivities.map(a => ({ date: new Date(a.occurred_at), direction: a.direction || 'outbound' })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (allEvents.length < 4) {
    return { totalGaps: 0, successfulReengagements: 0, failedReengagements: 0, successRate: 0, avgGapLength: null, insight: 'Not enough data.' };
  }

  // Find gaps > 7 days and check if outbound after gap got inbound response within 14 days
  let totalGaps = 0;
  let successful = 0;
  let failed = 0;
  const gapLengths: number[] = [];

  for (let i = 1; i < allEvents.length; i++) {
    const gap = differenceInDays(allEvents[i].date, allEvents[i - 1].date);
    if (gap >= 7) {
      totalGaps++;
      gapLengths.push(gap);

      // Check if the re-engagement attempt (outbound) got a response
      if (allEvents[i].direction === 'outbound') {
        const gotReply = allEvents.slice(i + 1, i + 5).some(e =>
          e.direction === 'inbound' && differenceInDays(e.date, allEvents[i].date) <= 14
        );
        if (gotReply) successful++;
        else failed++;
      }
    }
  }

  const successRate = totalGaps > 0 ? Math.round((successful / totalGaps) * 100) : 0;
  const avgGap = gapLengths.length > 0 ? Math.round(gapLengths.reduce((s, g) => s + g, 0) / gapLengths.length) : null;

  let insight = 'No significant communication gaps detected.';
  if (totalGaps > 0 && successRate >= 60) insight = `Strong re-engagement: ${successRate}% success rate after communication gaps.`;
  else if (totalGaps > 0 && successRate >= 30) insight = `Moderate re-engagement: ${successRate}% success rate. Consider different approaches.`;
  else if (totalGaps > 0) insight = `Low re-engagement: ${successRate}% success rate. Try changing channels or timing.`;

  return { totalGaps, successfulReengagements: successful, failedReengagements: failed, successRate, avgGapLength: avgGap, insight };
}

// ── 13. Lifecycle Position ──────────────────────────────────────────
export interface LifecyclePosition {
  phase: string;
  phaseIndex: number; // 0-4
  daysInPhase: number;
  nextPhase: string | null;
  actionToAdvance: string;
  progressPct: number; // 0-100
}

export function computeLifecyclePosition(entity: any, entityType: string): LifecyclePosition {
  if (entityType === 'deal') {
    const phases = ['offer', 'pending', 'under_contract', 'closing', 'closed'];
    const labels = ['Offer Submitted', 'Pending', 'Under Contract', 'Closing', 'Closed'];
    const nextLabels = ['Move to Pending', 'Get under contract', 'Prepare for closing', 'Close the deal', null];
    const actions = ['Follow up on offer response', 'Negotiate terms and get accepted', 'Handle inspections & appraisal', 'Finalize paperwork & funding', 'Deal complete — nurture for referrals'];

    const stage = entity?.stage || 'offer';
    const idx = phases.indexOf(stage);
    const phaseIndex = idx >= 0 ? idx : 0;

    const createdAt = entity?.created_at ? new Date(entity.created_at) : new Date();
    const daysInPhase = differenceInDays(new Date(), createdAt);

    return {
      phase: labels[phaseIndex],
      phaseIndex,
      daysInPhase,
      nextPhase: nextLabels[phaseIndex] || null,
      actionToAdvance: actions[phaseIndex],
      progressPct: Math.round(((phaseIndex + 1) / phases.length) * 100),
    };
  }

  // Lead lifecycle
  const temp = entity?.leadTemperature || entity?.lead_temperature || 'cold';
  const converted = !!entity?.converted_at;
  const lost = !!entity?.lost_at;

  if (lost) return { phase: 'Lost', phaseIndex: 0, daysInPhase: 0, nextPhase: 'Reactivation', actionToAdvance: 'Attempt re-engagement with a fresh approach.', progressPct: 0 };
  if (converted) return { phase: 'Converted', phaseIndex: 4, daysInPhase: 0, nextPhase: null, actionToAdvance: 'Nurture for referrals and repeat business.', progressPct: 100 };

  const phases = [
    { temp: 'cold', label: 'Cold Lead', action: 'Warm up with consistent outreach.', pct: 20 },
    { temp: 'warm', label: 'Warm Lead', action: 'Increase engagement to build momentum.', pct: 50 },
    { temp: 'hot', label: 'Hot Lead', action: 'Push for conversion — schedule meeting or showing.', pct: 80 },
  ];

  const match = phases.find(p => p.temp === temp) || phases[0];
  const createdAt = entity?.created_at ? new Date(entity.created_at) : new Date();

  return {
    phase: match.label,
    phaseIndex: phases.indexOf(match) + 1,
    daysInPhase: differenceInDays(new Date(), createdAt),
    nextPhase: phases[phases.indexOf(match) + 1]?.label || 'Conversion',
    actionToAdvance: match.action,
    progressPct: match.pct,
  };
}

// ── 14. Outreach Effectiveness ──────────────────────────────────────
export interface OutreachEffectiveness {
  channels: { channel: string; sent: number; replied: number; rate: number }[];
  bestChannel: string | null;
  worstChannel: string | null;
  insight: string;
}

export function computeOutreachEffectiveness(fubActivities: FubActivity[]): OutreachEffectiveness {
  const sorted = [...fubActivities].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const channelStats: Record<string, { sent: number; replied: number }> = {};

  for (let i = 0; i < sorted.length; i++) {
    const ch = normalizeChannel(sorted[i].activity_type);
    if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0 };

    if (sorted[i].direction === 'outbound') {
      channelStats[ch].sent++;
      // Check if next event within 7 days is inbound
      for (let j = i + 1; j < Math.min(i + 5, sorted.length); j++) {
        if (sorted[j].direction === 'inbound' && differenceInDays(new Date(sorted[j].occurred_at), new Date(sorted[i].occurred_at)) <= 7) {
          channelStats[ch].replied++;
          break;
        }
      }
    }
  }

  const channels = Object.entries(channelStats)
    .filter(([, s]) => s.sent > 0)
    .map(([channel, s]) => ({ channel, sent: s.sent, replied: s.replied, rate: Math.round((s.replied / s.sent) * 100) }))
    .sort((a, b) => b.rate - a.rate);

  const best = channels[0];
  const worst = channels.length > 1 ? channels[channels.length - 1] : null;

  let insight = 'Not enough outbound data to measure effectiveness.';
  if (best && best.sent >= 2) {
    insight = `${best.channel} gets the best response rate (${best.rate}%).`;
    if (worst && worst.rate < best.rate) {
      insight += ` ${worst.channel} is least effective (${worst.rate}%).`;
    }
  }

  return { channels, bestChannel: best?.channel || null, worstChannel: worst?.channel || null, insight };
}

// ── 15. Recent Activity Summary ─────────────────────────────────────
export interface RecentActivityItem {
  type: string;
  direction: string | null;
  subject: string | null;
  date: Date;
  dayLabel: string;
  channel: string;
}

export function getRecentActivity(
  activities: ActivityEvent[],
  fubActivities: FubActivity[],
  limit = 8,
): RecentActivityItem[] {
  const combined = [
    ...activities.map(a => ({
      type: a.touch_type,
      direction: null as string | null,
      subject: a.note,
      date: new Date(a.created_at),
      channel: normalizeChannel(a.touch_type),
    })),
    ...fubActivities.map(a => ({
      type: a.activity_type,
      direction: a.direction,
      subject: a.subject || a.body_preview,
      date: new Date(a.occurred_at),
      channel: normalizeChannel(a.activity_type),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);

  return combined.map(item => ({
    ...item,
    dayLabel: formatDaysAgo(item.date),
  }));
}

function formatDaysAgo(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return format(date, 'MMM d');
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractPropertyKeywords(text: string, result: PropertyInterest) {
  const typePatterns: [RegExp, string][] = [
    [/\bsingle[\s-]?family\b/i, 'Single Family'],
    [/\bcondo(?:minium)?\b/i, 'Condo'],
    [/\btownho(?:me|use)\b/i, 'Townhouse'],
    [/\bduplex\b/i, 'Duplex'],
    [/\bmulti[\s-]?family\b/i, 'Multi-family'],
    [/\b(?:manufactured|mobile)\s*home\b/i, 'Manufactured'],
    [/\bvacant\s+(?:land|lot)\b/i, 'Land'],
    [/\bfarm\b/i, 'Farm/Ranch'],
    [/\bcommercial\b/i, 'Commercial'],
  ];
  for (const [pat, label] of typePatterns) {
    if (pat.test(text) && !result.propertyTypes.includes(label)) {
      result.propertyTypes.push(label);
    }
  }

  const priceMatch = text.match(/\$[\d,]+(?:k|K|,000)?/g);
  if (priceMatch && !result.priceRange) {
    const prices = priceMatch.map(p => parsePrice(p)).filter(p => p > 10000).sort((a, b) => a - b);
    if (prices.length >= 2) {
      result.priceRange = `$${fmtK(prices[0])} – $${fmtK(prices[prices.length - 1])}`;
    } else if (prices.length === 1) {
      if (!result.priceRange) result.priceRange = `~$${fmtK(prices[0])}`;
    }
  }

  const bedMatch = text.toLowerCase().match(/(\d)\s*(?:bed(?:room)?s?|br|bd)\b/);
  if (bedMatch && !result.bedrooms) result.bedrooms = bedMatch[1];

  const bathMatch = text.toLowerCase().match(/([\d.]+)\s*(?:bath(?:room)?s?|ba)\b/);
  if (bathMatch && !result.bathrooms) result.bathrooms = bathMatch[1];

  if (/\bfixer[\s-]?upper\b/i.test(text)) result.extractedKeywords.push('Fixer-upper');
  if (/\bnew\s+construction\b/i.test(text)) result.extractedKeywords.push('New construction');
  if (/\bpool\b/i.test(text)) result.extractedKeywords.push('Pool');
  if (/\bwaterfront\b/i.test(text)) result.extractedKeywords.push('Waterfront');
  if (/\bgolf\b/i.test(text)) result.extractedKeywords.push('Golf');
  if (/\bgated\b/i.test(text)) result.extractedKeywords.push('Gated community');
  if (/\bschool\s*(?:district|zone)\b/i.test(text)) result.extractedKeywords.push('School district');
  if (/\bdownsiz/i.test(text)) result.extractedKeywords.push('Downsizing');
  if (/\bupgrad/i.test(text)) result.extractedKeywords.push('Upgrading');
  if (/\binvest(?:ment|or)\b/i.test(text)) result.extractedKeywords.push('Investment');
}

function parsePrice(s: string): number {
  const cleaned = s.replace(/[$,]/g, '');
  if (/k$/i.test(cleaned)) return parseFloat(cleaned) * 1000;
  return parseFloat(cleaned) || 0;
}

export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}
