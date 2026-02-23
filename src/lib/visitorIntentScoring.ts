/**
 * Visitor Intent Scoring Engine
 * Scores open house visitors by their form responses to prioritize follow-up.
 * 
 * Scoring factors (0-100):
 * - Buy timeline urgency (0-35)
 * - Price range commitment (0-20)
 * - Agent representation (0-20)
 * - Selling intent (0-15)
 * - Contact completeness (0-10)
 */

export interface IntentScore {
  score: number;
  label: 'Hot' | 'Warm' | 'Cool' | 'Browser';
  color: string; // tailwind class
  reasons: string[];
}

const TIMELINE_SCORES: Record<string, number> = {
  'ASAP': 35,
  '1-3 months': 28,
  '3-6 months': 18,
  '6-12 months': 10,
  'Just browsing': 0,
};

const PRICE_SCORES: Record<string, number> = {
  '$1M+': 20,
  '$800K-$1M': 18,
  '$600K-$800K': 16,
  '$400K-$600K': 14,
  '$200K-$400K': 12,
  'Under $200K': 10,
};

export function scoreVisitorIntent(responses: Record<string, any>, hasEmail: boolean, hasPhone: boolean): IntentScore {
  let score = 0;
  const reasons: string[] = [];

  // Buy timeline
  const timeline = responses.buy_timeline;
  if (timeline && TIMELINE_SCORES[timeline] !== undefined) {
    score += TIMELINE_SCORES[timeline];
    if (TIMELINE_SCORES[timeline] >= 28) reasons.push(`Buying ${timeline.toLowerCase()}`);
  }

  // Price range
  const price = responses.price_range;
  if (price && PRICE_SCORES[price] !== undefined) {
    score += PRICE_SCORES[price];
    reasons.push(`Budget: ${price}`);
  }

  // No agent = opportunity
  if (responses.working_with_agent === 'No') {
    score += 20;
    reasons.push('No agent');
  } else if (responses.working_with_agent === 'Yes') {
    score += 5;
  }

  // Selling = dual opportunity
  if (responses.selling_home === 'Yes') {
    score += 15;
    reasons.push('Also selling');
  }
  // Sell timeline
  const sellTimeline = responses.sell_timeline;
  if (sellTimeline && sellTimeline !== 'Not selling') {
    if (TIMELINE_SCORES[sellTimeline] !== undefined) {
      score += Math.round(TIMELINE_SCORES[sellTimeline] * 0.3);
    }
  }

  // Contact completeness
  if (hasEmail) score += 5;
  if (hasPhone) score += 5;
  if (hasEmail && hasPhone) reasons.push('Full contact info');

  // Cap at 100
  score = Math.min(100, score);

  // Label
  let label: IntentScore['label'];
  let color: string;
  if (score >= 65) { label = 'Hot'; color = 'text-red-500'; }
  else if (score >= 40) { label = 'Warm'; color = 'text-amber-500'; }
  else if (score >= 20) { label = 'Cool'; color = 'text-blue-500'; }
  else { label = 'Browser'; color = 'text-muted-foreground'; }

  return { score, label, color, reasons };
}

/**
 * Cross-event intelligence: analyze a visitor's history across multiple open houses
 */
export interface CrossEventInsight {
  visitCount: number;
  properties: string[];
  firstVisit: string;
  lastVisit: string;
  narrowingPattern: string | null;
  avgIntentScore: number;
  isRepeatVisitor: boolean;
}

export function analyzeCrossEventVisitor(
  visitorEmail: string,
  allVisitors: Array<{
    email: string | null;
    full_name: string;
    created_at: string;
    responses: Record<string, any>;
    open_houses?: { property_address: string } | null;
  }>
): CrossEventInsight | null {
  if (!visitorEmail) return null;

  const matches = allVisitors
    .filter(v => v.email?.toLowerCase() === visitorEmail.toLowerCase())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (matches.length < 2) return null;

  const properties = [...new Set(matches.map(m => (m as any).open_houses?.property_address).filter(Boolean))];
  
  // Detect narrowing pattern from price ranges
  const priceOrder = ['Under $200K', '$200K-$400K', '$400K-$600K', '$600K-$800K', '$800K-$1M', '$1M+'];
  const priceIndices = matches
    .map(m => priceOrder.indexOf(m.responses?.price_range))
    .filter(i => i >= 0);
  
  let narrowingPattern: string | null = null;
  if (priceIndices.length >= 2) {
    const range = Math.max(...priceIndices) - Math.min(...priceIndices);
    if (range <= 1) narrowingPattern = `Narrowing to ${matches[matches.length - 1].responses?.price_range || 'specific range'}`;
    else narrowingPattern = `Exploring range: ${priceOrder[Math.min(...priceIndices)]} to ${priceOrder[Math.max(...priceIndices)]}`;
  }

  // Property type pattern
  const types = [...new Set(matches.map(m => m.responses?.property_type).filter(Boolean))];
  if (types.length === 1) {
    narrowingPattern = (narrowingPattern ? narrowingPattern + ', ' : '') + `Focused on ${types[0]}`;
  }

  const scores = matches.map(m => scoreVisitorIntent(m.responses || {}, !!m.email, !!((m as any).phone)));

  return {
    visitCount: matches.length,
    properties,
    firstVisit: matches[0].created_at,
    lastVisit: matches[matches.length - 1].created_at,
    narrowingPattern,
    avgIntentScore: Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length),
    isRepeatVisitor: true,
  };
}
