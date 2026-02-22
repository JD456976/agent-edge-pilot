import { differenceInDays, differenceInWeeks, format, startOfWeek } from 'date-fns';

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
}

export function computeResponseMetrics(fubActivities: FubActivity[]): ResponseMetrics {
  let inbound = 0;
  let outbound = 0;
  fubActivities.forEach(a => {
    if (a.direction === 'inbound') inbound++;
    else if (a.direction === 'outbound') outbound++;
  });

  const ratio = outbound > 0 ? Math.round((inbound / outbound) * 100) : inbound > 0 ? 100 : 0;

  // Estimate avg gap between outbound and next inbound
  const sorted = [...fubActivities].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].direction === 'outbound' && sorted[i + 1].direction === 'inbound') {
      const gap = differenceInDays(new Date(sorted[i + 1].occurred_at), new Date(sorted[i].occurred_at));
      if (gap >= 0 && gap < 60) gaps.push(gap);
    }
  }
  const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

  let label = 'No data';
  if (ratio >= 80) label = 'Highly responsive';
  else if (ratio >= 50) label = 'Good engagement';
  else if (ratio >= 25) label = 'Moderate engagement';
  else if (outbound > 0) label = 'Low responsiveness';

  return { totalOutbound: outbound, totalInbound: inbound, responseRatio: ratio, avgResponseGapDays: avgGap, label };
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

  // Best channel = one with highest inbound response
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
  let score = 50; // baseline
  const factors: string[] = [];
  const totalEvents = activities.length + fubActivities.length;

  const allDates = [
    ...activities.map(a => new Date(a.created_at)),
    ...fubActivities.map(a => new Date(a.occurred_at)),
  ].sort((a, b) => a.getTime() - b.getTime());

  const lastDate = allDates[allDates.length - 1];
  const daysSinceLast = lastDate ? differenceInDays(new Date(), lastDate) : null;

  // Recency factor
  if (daysSinceLast !== null) {
    if (daysSinceLast <= 2) { score += 15; factors.push('+15 Recent contact'); }
    else if (daysSinceLast <= 7) { score += 5; factors.push('+5 Active this week'); }
    else if (daysSinceLast > 14) { score -= 20; factors.push('-20 No contact 14+ days'); }
    else if (daysSinceLast > 7) { score -= 10; factors.push('-10 Going quiet'); }
  } else {
    score -= 25; factors.push('-25 No activity history');
  }

  // Volume factor
  if (totalEvents >= 20) { score += 15; factors.push('+15 Deep relationship'); }
  else if (totalEvents >= 10) { score += 10; factors.push('+10 Good engagement volume'); }
  else if (totalEvents >= 5) { score += 5; factors.push('+5 Some engagement'); }
  else if (totalEvents < 3) { score -= 10; factors.push('-10 Minimal interaction'); }

  // Response ratio factor
  let inbound = 0, outbound = 0;
  fubActivities.forEach(a => {
    if (a.direction === 'inbound') inbound++;
    else if (a.direction === 'outbound') outbound++;
  });
  if (outbound > 3 && inbound === 0) { score -= 15; factors.push('-15 No responses detected'); }
  else if (inbound > outbound && totalEvents > 3) { score += 10; factors.push('+10 Strong inbound engagement'); }
  else if (inbound > 0 && outbound > 0) { score += 5; factors.push('+5 Two-way communication'); }

  // Entity-specific
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
}

export function analyzePropertyInterest(
  fubActivities: FubActivity[],
  personProfile: FubPersonProfile | null,
  entity: any,
): PropertyInterest {
  const result: PropertyInterest = {
    priceRange: null,
    propertyTypes: [],
    locations: [],
    bedrooms: null,
    bathrooms: null,
    timeFrame: null,
    preApproved: null,
    preApprovalAmount: null,
    tags: [],
    extractedKeywords: [],
    currentAddress: null,
    stage: null,
    source: null,
    background: null,
  };

  if (!personProfile && fubActivities.length === 0) return result;

  // ── From FUB person profile ──
  if (personProfile) {
    result.stage = personProfile.stage || null;
    result.source = personProfile.source || null;
    result.background = personProfile.background || null;
    result.tags = (personProfile.tags || []).filter(Boolean);

    if (personProfile.price || personProfile.priceRangeLow || personProfile.priceRangeHigh) {
      const low = personProfile.priceRangeLow || personProfile.price;
      const high = personProfile.priceRangeHigh || personProfile.price;
      if (low && high && low !== high) {
        result.priceRange = `$${fmtK(low)} – $${fmtK(high)}`;
      } else if (low || high) {
        result.priceRange = `~$${fmtK(low || high!)}`;
      }
    }

    if (personProfile.propertyType) {
      result.propertyTypes.push(personProfile.propertyType);
    }

    if (personProfile.bedrooms) result.bedrooms = `${personProfile.bedrooms}`;
    if (personProfile.bathrooms) result.bathrooms = `${personProfile.bathrooms}`;
    if (personProfile.timeFrame) result.timeFrame = personProfile.timeFrame;
    if (personProfile.preApproved != null) result.preApproved = personProfile.preApproved;
    if (personProfile.preApprovalAmount) result.preApprovalAmount = personProfile.preApprovalAmount;

    // Addresses → locations
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

    // Cities
    if (personProfile.cities) {
      const cities = Array.isArray(personProfile.cities) ? personProfile.cities : [personProfile.cities];
      for (const c of cities) {
        if (c && !result.locations.includes(c)) result.locations.push(c);
      }
    }
    if (personProfile.state && result.locations.length === 0) {
      result.locations.push(personProfile.state);
    }

    // Custom fields
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

  // ── From entity notes ──
  const notes = entity?.notes || '';
  if (notes) {
    extractPropertyKeywords(notes, result);
  }

  // ── From activity content (subjects + body previews) ──
  const textCorpus = fubActivities
    .map(a => [a.subject, a.body_preview].filter(Boolean).join(' '))
    .join(' ');
  if (textCorpus.length > 20) {
    extractPropertyKeywords(textCorpus, result);
  }

  // ── From tags ──
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

  // Deduplicate
  result.extractedKeywords = [...new Set(result.extractedKeywords)];
  result.propertyTypes = [...new Set(result.propertyTypes)];
  result.locations = [...new Set(result.locations)];

  return result;
}

function extractPropertyKeywords(text: string, result: PropertyInterest) {
  const lower = text.toLowerCase();

  // Property types
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

  // Price mentions
  const priceMatch = text.match(/\$[\d,]+(?:k|K|,000)?/g);
  if (priceMatch && !result.priceRange) {
    const prices = priceMatch.map(p => parsePrice(p)).filter(p => p > 10000).sort((a, b) => a - b);
    if (prices.length >= 2) {
      result.priceRange = `$${fmtK(prices[0])} – $${fmtK(prices[prices.length - 1])}`;
    } else if (prices.length === 1) {
      if (!result.priceRange) result.priceRange = `~$${fmtK(prices[0])}`;
    }
  }

  // Bedroom mentions
  const bedMatch = lower.match(/(\d)\s*(?:bed(?:room)?s?|br|bd)\b/);
  if (bedMatch && !result.bedrooms) result.bedrooms = bedMatch[1];

  // Bathroom mentions
  const bathMatch = lower.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba)\b/);
  if (bathMatch && !result.bathrooms) result.bathrooms = bathMatch[1];

  // Interest keywords
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

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}
