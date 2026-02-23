/**
 * Preference Intelligence Engine — deterministic, no AI
 * 
 * Infers client property preferences from FUB data:
 * tags, notes, activity text, links, stage, and behavior signals.
 * All scoring is explainable with reasons/evidence.
 */

import { differenceInDays } from 'date-fns';
import type { FubActivity, FubPersonProfile } from '@/lib/intelAnalyzer';

// ── Output Types ──────────────────────────────────────────────────────

export interface ScoredItem {
  name: string;
  score: number;
}

export interface PreferenceProfile {
  inferred_towns: ScoredItem[];
  inferred_price_band: { min: number | null; max: number | null; confidence: number };
  inferred_property_type: Array<{ type: 'SFH' | 'Condo' | 'Multi' | 'Land' | 'Townhouse' | 'Unknown'; score: number }>;
  inferred_must_haves: ScoredItem[];
  inferred_avoid: ScoredItem[];
  urgency: { level: 'low' | 'medium' | 'high'; reasons: string[] };
  recommended_next_questions: string[];
  suggested_search_seed: {
    towns: string[];
    price_min: number | null;
    price_max: number | null;
    beds_min: number | null;
    baths_min: number | null;
    type: string | null;
  };
}

export interface SignalEvidence {
  signal: string;
  weight: number;
  evidence: string;
}

export interface PreferenceReasons {
  top_signals: SignalEvidence[];
  examples: {
    matched_phrases: string[];
    matched_tags: string[];
    matched_links: string[];
  };
}

export interface PreferenceResult {
  profile: PreferenceProfile;
  confidence: number;
  reasons: PreferenceReasons;
}

// ── Configurable Signal Maps ──────────────────────────────────────────

const TAG_PROPERTY_TYPE_MAP: Record<string, { type: string; weight: number }> = {
  'condo': { type: 'Condo', weight: 8 },
  'single family': { type: 'SFH', weight: 8 },
  'sfh': { type: 'SFH', weight: 8 },
  'single-family': { type: 'SFH', weight: 8 },
  'multi': { type: 'Multi', weight: 10 },
  'multifamily': { type: 'Multi', weight: 10 },
  'multi-family': { type: 'Multi', weight: 10 },
  'investment': { type: 'Multi', weight: 10 },
  'townhouse': { type: 'Townhouse', weight: 7 },
  'townhome': { type: 'Townhouse', weight: 7 },
  'land': { type: 'Land', weight: 8 },
  'vacant lot': { type: 'Land', weight: 8 },
};

const TAG_MUST_HAVE_MAP: Record<string, { label: string; weight: number }> = {
  'commute': { label: 'Easy commute', weight: 4 },
  'schools': { label: 'Good schools', weight: 4 },
  'school district': { label: 'Good schools', weight: 4 },
  'yard': { label: 'Yard', weight: 5 },
  'garage': { label: 'Garage', weight: 5 },
  'pool': { label: 'Pool', weight: 4 },
  'walkable': { label: 'Walkable', weight: 4 },
  'transit': { label: 'Near transit', weight: 4 },
  'parking': { label: 'Parking', weight: 3 },
  'fenced': { label: 'Fenced yard', weight: 3 },
  'office': { label: 'Home office', weight: 3 },
  'pet friendly': { label: 'Pet-friendly', weight: 3 },
};

const TAG_AVOID_MAP: Record<string, { label: string; weight: number }> = {
  'busy road': { label: 'Busy road', weight: 3 },
  'hoa': { label: 'HOA', weight: 2 },
  'stairs': { label: 'Stairs', weight: 2 },
  'septic': { label: 'Septic system', weight: 3 },
  'flood zone': { label: 'Flood zone', weight: 4 },
};

const TAG_URGENCY_MAP: Record<string, { urgencyDelta: number; label: string }> = {
  'first time': { urgencyDelta: 1, label: 'First-time buyer — may need guidance' },
  'first-time': { urgencyDelta: 1, label: 'First-time buyer — may need guidance' },
  'downsizing': { urgencyDelta: 0, label: 'Downsizing' },
};

const TEXT_MUST_HAVE_PATTERNS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\bgarage\b/i, label: 'Garage', weight: 4 },
  { pattern: /\byard\b/i, label: 'Yard', weight: 4 },
  { pattern: /\bfenced\b/i, label: 'Fenced yard', weight: 3 },
  { pattern: /\boffice\b/i, label: 'Home office', weight: 3 },
  { pattern: /\bwalkable?\b/i, label: 'Walkable', weight: 3 },
  { pattern: /\btransit\b/i, label: 'Near transit', weight: 3 },
  { pattern: /\bparking\b/i, label: 'Parking', weight: 3 },
  { pattern: /\bpool\b/i, label: 'Pool', weight: 4 },
  { pattern: /\bschool/i, label: 'Good schools', weight: 4 },
  { pattern: /\bcommute\b/i, label: 'Easy commute', weight: 3 },
  { pattern: /\bbasement\b/i, label: 'Basement', weight: 3 },
  { pattern: /\bfireplace\b/i, label: 'Fireplace', weight: 2 },
  { pattern: /\bview\b/i, label: 'View', weight: 2 },
  { pattern: /\bpet\b/i, label: 'Pet-friendly', weight: 2 },
];

const TEXT_AVOID_PATTERNS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\bbusy road\b/i, label: 'Busy road', weight: 3 },
  { pattern: /\bh\.?o\.?a\.?\b/i, label: 'HOA', weight: 2 },
  { pattern: /\bstairs\b/i, label: 'Stairs', weight: 2 },
  { pattern: /\bseptic\b/i, label: 'Septic system', weight: 3 },
  { pattern: /\bflood zone\b/i, label: 'Flood zone', weight: 3 },
  { pattern: /\bnoise\b/i, label: 'Noise', weight: 2 },
];

const TEXT_PROPERTY_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string; weight: number }> = [
  { pattern: /\bcondo(?:minium)?\b/i, type: 'Condo', weight: 5 },
  { pattern: /\btownho(?:me|use)\b/i, type: 'Townhouse', weight: 5 },
  { pattern: /\bcolonial\b/i, type: 'SFH', weight: 4 },
  { pattern: /\branch\b/i, type: 'SFH', weight: 4 },
  { pattern: /\bcape\b/i, type: 'SFH', weight: 3 },
  { pattern: /\bsingle[\s-]?family\b/i, type: 'SFH', weight: 5 },
  { pattern: /\bmulti[\s-]?family\b/i, type: 'Multi', weight: 6 },
  { pattern: /\bduplex\b/i, type: 'Multi', weight: 5 },
  { pattern: /\btriplex\b/i, type: 'Multi', weight: 5 },
  { pattern: /\bland\b/i, type: 'Land', weight: 3 },
];

const LINK_PATTERNS = [
  /https?:\/\/(?:www\.)?zillow\.com\/\S+/gi,
  /https?:\/\/(?:www\.)?redfin\.com\/\S+/gi,
  /https?:\/\/(?:www\.)?realtor\.com\/\S+/gi,
  /https?:\/\/(?:www\.)?trulia\.com\/\S+/gi,
];

// ── Recency decay ─────────────────────────────────────────────────────

function recencyMultiplier(occurredAt: string): number {
  const days = differenceInDays(new Date(), new Date(occurredAt));
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.6;
  return 0; // ignore older than 90d
}

// ── Main Engine ───────────────────────────────────────────────────────

export function computePreferences(
  personProfile: FubPersonProfile | null,
  fubActivities: FubActivity[],
  entity: any,
  overrides?: Record<string, any>,
): PreferenceResult {
  const townScores: Record<string, number> = {};
  const typeScores: Record<string, number> = {};
  const mustHaveScores: Record<string, number> = {};
  const avoidScores: Record<string, number> = {};
  const signals: SignalEvidence[] = [];
  const matchedPhrases: string[] = [];
  const matchedTags: string[] = [];
  const matchedLinks: string[] = [];
  const urgencyReasons: string[] = [];
  let urgencyScore = 0;
  const priceHints: number[] = [];
  let bedsHint: number | null = null;
  let bathsHint: number | null = null;

  // ── A) Tag-based signals (strong) ─────────────────────────────────
  const tags = personProfile?.tags || [];
  for (const tag of tags) {
    const tl = tag.toLowerCase();

    // Property type from tags
    for (const [keyword, { type, weight }] of Object.entries(TAG_PROPERTY_TYPE_MAP)) {
      if (tl.includes(keyword)) {
        typeScores[type] = (typeScores[type] || 0) + weight;
        signals.push({ signal: `Tag: "${tag}"`, weight, evidence: `Implies ${type}` });
        matchedTags.push(tag);
      }
    }

    // Must-haves from tags
    for (const [keyword, { label, weight }] of Object.entries(TAG_MUST_HAVE_MAP)) {
      if (tl.includes(keyword)) {
        mustHaveScores[label] = (mustHaveScores[label] || 0) + weight;
        signals.push({ signal: `Tag: "${tag}"`, weight, evidence: `Must-have: ${label}` });
        matchedTags.push(tag);
      }
    }

    // Avoid from tags
    for (const [keyword, { label, weight }] of Object.entries(TAG_AVOID_MAP)) {
      if (tl.includes(keyword)) {
        avoidScores[label] = (avoidScores[label] || 0) + weight;
        signals.push({ signal: `Tag: "${tag}"`, weight, evidence: `Avoid: ${label}` });
        matchedTags.push(tag);
      }
    }

    // Urgency from tags
    for (const [keyword, { urgencyDelta, label }] of Object.entries(TAG_URGENCY_MAP)) {
      if (tl.includes(keyword)) {
        urgencyScore += urgencyDelta;
        urgencyReasons.push(label);
      }
    }

    // Downsizing -> Condo hint + avoid stairs
    if (tl.includes('downsizing')) {
      typeScores['Condo'] = (typeScores['Condo'] || 0) + 4;
      avoidScores['Stairs'] = (avoidScores['Stairs'] || 0) + 2;
      signals.push({ signal: `Tag: "${tag}"`, weight: 4, evidence: 'Downsizing → Condo preference, avoid stairs' });
    }
  }

  // ── FUB profile data ──────────────────────────────────────────────
  if (personProfile) {
    // Locations from profile
    if (personProfile.cities) {
      const cities = Array.isArray(personProfile.cities) ? personProfile.cities : [personProfile.cities];
      for (const c of cities) {
        if (c) {
          townScores[c] = (townScores[c] || 0) + 8;
          signals.push({ signal: 'FUB profile cities', weight: 8, evidence: c });
        }
      }
    }
    const addresses = personProfile.addresses || [];
    for (const addr of addresses) {
      if (addr.city && addr.type !== 'home') {
        townScores[addr.city] = (townScores[addr.city] || 0) + 6;
        signals.push({ signal: 'FUB address', weight: 6, evidence: addr.city });
      }
    }

    // Price from profile
    if (personProfile.price) priceHints.push(personProfile.price);
    if (personProfile.priceRangeLow) priceHints.push(personProfile.priceRangeLow);
    if (personProfile.priceRangeHigh) priceHints.push(personProfile.priceRangeHigh);
    if (personProfile.preApprovalAmount) priceHints.push(personProfile.preApprovalAmount);

    // Property type from profile
    if (personProfile.propertyType) {
      const mapped = mapPropertyType(personProfile.propertyType);
      typeScores[mapped] = (typeScores[mapped] || 0) + 10;
      signals.push({ signal: 'FUB property type', weight: 10, evidence: personProfile.propertyType });
    }

    if (personProfile.bedrooms) bedsHint = personProfile.bedrooms;
    if (personProfile.bathrooms) bathsHint = personProfile.bathrooms;

    // Stage-based urgency
    const stage = (personProfile.stage || '').toLowerCase();
    if (/hot|appt|showing|offer/.test(stage)) {
      urgencyScore += 3;
      urgencyReasons.push(`Stage: ${personProfile.stage}`);
      signals.push({ signal: 'FUB stage', weight: 3, evidence: `${personProfile.stage} → high urgency` });
    }
  }

  // ── B) Note/event text extraction with recency decay ──────────────
  const recentActivities = fubActivities.filter(a => {
    const days = differenceInDays(new Date(), new Date(a.occurred_at));
    return days <= 90;
  }).slice(0, 200);

  for (const activity of recentActivities) {
    const text = [activity.subject, activity.body_preview].filter(Boolean).join(' ');
    if (!text || text.length < 5) continue;
    const decay = recencyMultiplier(activity.occurred_at);
    if (decay === 0) continue;

    // Property types from text
    for (const { pattern, type, weight } of TEXT_PROPERTY_TYPE_PATTERNS) {
      if (pattern.test(text)) {
        const w = Math.round(weight * decay);
        typeScores[type] = (typeScores[type] || 0) + w;
        if (w > 0) {
          const phrase = text.match(pattern)?.[0] || type;
          matchedPhrases.push(phrase);
        }
      }
    }

    // Must-haves from text
    for (const { pattern, label, weight } of TEXT_MUST_HAVE_PATTERNS) {
      if (pattern.test(text)) {
        const w = Math.round(weight * decay);
        mustHaveScores[label] = (mustHaveScores[label] || 0) + w;
        if (w > 0) {
          const phrase = text.match(pattern)?.[0] || label;
          matchedPhrases.push(phrase);
        }
      }
    }

    // Avoid from text
    for (const { pattern, label, weight } of TEXT_AVOID_PATTERNS) {
      if (pattern.test(text)) {
        const w = Math.round(weight * decay);
        avoidScores[label] = (avoidScores[label] || 0) + w;
      }
    }

    // ── C) Link parsing ─────────────────────────────────────────────
    for (const linkPattern of LINK_PATTERNS) {
      const links = text.match(linkPattern);
      if (links) {
        for (const link of links) {
          matchedLinks.push(link);
          // Extract town from URL slug
          const townFromUrl = extractTownFromUrl(link);
          if (townFromUrl) {
            townScores[townFromUrl] = (townScores[townFromUrl] || 0) + 10;
            signals.push({ signal: 'Link', weight: 10, evidence: `${townFromUrl} from ${link.substring(0, 60)}` });
          }
          // Extract price from URL
          const priceFromUrl = extractPriceFromUrl(link);
          if (priceFromUrl) priceHints.push(priceFromUrl);
        }
      }
    }

    // Price extraction from text
    const priceMatches = text.match(/\$[\d,]+(?:k|K|,000)?/g);
    if (priceMatches) {
      for (const pm of priceMatches) {
        const p = parsePrice(pm);
        if (p > 50000 && p < 10_000_000) priceHints.push(p);
      }
    }

    // Beds from text
    const bedMatch = text.match(/(\d)\s*(?:bed(?:room)?s?|br|bd)\b/i);
    if (bedMatch && !bedsHint) bedsHint = parseInt(bedMatch[1]);

    // Baths from text
    const bathMatch = text.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba)\b/i);
    if (bathMatch && !bathsHint) bathsHint = parseFloat(bathMatch[1]);
  }

  // ── D) Behavior-based urgency ─────────────────────────────────────
  const lastActivity = personProfile?.lastActivity || entity?.last_activity_at || entity?.last_touched_at;
  if (lastActivity) {
    const daysSince = differenceInDays(new Date(), new Date(lastActivity));
    if (daysSince <= 2) {
      urgencyScore += 2;
      urgencyReasons.push('Active in last 48 hours');
    } else if (daysSince > 14) {
      urgencyScore -= 2;
      urgencyReasons.push('No activity in 14+ days — needs follow-up');
    }
  }

  // Entity-level stage signals
  if (entity?.stage) {
    const s = entity.stage.toLowerCase();
    if (['pending', 'offer_accepted'].includes(s)) {
      urgencyScore += 2;
      urgencyReasons.push(`Deal stage: ${entity.stage}`);
    }
  }
  if (entity?.leadTemperature === 'hot') {
    urgencyScore += 2;
    urgencyReasons.push('Hot lead');
  }

  // ── Apply overrides ────────────────────────────────────────────────
  if (overrides?.towns) {
    for (const t of overrides.towns) {
      if (t.action === 'confirm') townScores[t.name] = (townScores[t.name] || 0) + 20;
      if (t.action === 'reject') delete townScores[t.name];
    }
  }
  if (overrides?.price_min != null) priceHints.push(overrides.price_min);
  if (overrides?.price_max != null) priceHints.push(overrides.price_max);
  if (overrides?.property_type) {
    typeScores[overrides.property_type] = (typeScores[overrides.property_type] || 0) + 30;
  }
  if (overrides?.must_haves) {
    for (const mh of overrides.must_haves) {
      mustHaveScores[mh] = (mustHaveScores[mh] || 0) + 20;
    }
  }

  // ── Assemble results ──────────────────────────────────────────────
  const inferredTowns = Object.entries(townScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const inferredPropertyType = Object.entries(typeScores)
    .map(([type, score]) => ({ type: type as any, score }))
    .sort((a, b) => b.score - a.score);
  if (inferredPropertyType.length === 0) {
    inferredPropertyType.push({ type: 'Unknown', score: 0 });
  }

  const inferredMustHaves = Object.entries(mustHaveScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const inferredAvoid = Object.entries(avoidScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Price band
  const validPrices = priceHints.filter(p => p > 50000 && p < 10_000_000).sort((a, b) => a - b);
  const priceMin = validPrices.length > 0 ? validPrices[0] : null;
  const priceMax = validPrices.length > 1 ? validPrices[validPrices.length - 1] : priceMin;
  const priceConfidence = validPrices.length >= 2
    ? (priceMax! - priceMin!) / priceMax! <= 0.2 ? 0.9 : 0.6
    : validPrices.length === 1 ? 0.4 : 0;

  // Urgency
  const urgencyLevel: 'low' | 'medium' | 'high' = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';

  // ── E) Confidence computation ─────────────────────────────────────
  let confidence = 0.3;
  const strongSignals = signals.filter(s => s.weight >= 6).length;
  if (strongSignals >= 2) confidence += 0.15;
  const consistentTowns = inferredTowns.filter(t => t.score >= 6).length;
  if (consistentTowns >= 3) confidence += 0.10;
  if (priceConfidence >= 0.8) confidence += 0.10;

  // Penalties
  const topTypes = inferredPropertyType.filter(t => t.score > 5);
  if (topTypes.length >= 2 && topTypes[0].score - topTypes[1].score < 3) {
    confidence -= 0.10; // conflicting property types
  }
  if (inferredTowns.length > 5 && inferredTowns[0].score - inferredTowns[4].score < 3) {
    confidence -= 0.10; // too many uncertain towns
  }

  confidence = Math.max(0, Math.min(1, confidence));

  // ── Recommended questions ─────────────────────────────────────────
  const questions: string[] = [];
  if (inferredTowns.length === 0) {
    questions.push('What towns or areas are you prioritizing right now?');
  } else if (confidence < 0.5 && inferredTowns.length > 3) {
    questions.push(`You've mentioned ${inferredTowns.slice(0, 3).map(t => t.name).join(', ')} — which is your top priority?`);
  }
  if (!priceMin) {
    questions.push('What\'s your target budget range?');
  } else if (priceConfidence < 0.6) {
    questions.push(`Are you capped at $${fmtK(priceMax!)}?`);
  }
  if (inferredPropertyType[0].type === 'Unknown') {
    questions.push('Are you looking for a single-family home, condo, or something else?');
  }
  if (inferredMustHaves.length === 0) {
    questions.push('What are your must-haves? (e.g., garage, yard, schools)');
  }
  if (urgencyLevel === 'low' && lastActivity) {
    questions.push('Are you still actively looking, or is the timeline flexible?');
  }
  if (inferredTowns.length > 0 && questions.length < 3) {
    questions.push(`I can set up a search for new listings in ${inferredTowns[0].name}. Want me to?`);
  }

  // ── Suggested search seed ─────────────────────────────────────────
  const suggestedSeed = {
    towns: inferredTowns.slice(0, 3).map(t => t.name),
    price_min: priceMin,
    price_max: priceMax,
    beds_min: bedsHint,
    baths_min: bathsHint ? Math.floor(bathsHint) : null,
    type: inferredPropertyType[0].type !== 'Unknown' ? inferredPropertyType[0].type : null,
  };

  // Sort and deduplicate signals
  const topSignals = signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  return {
    profile: {
      inferred_towns: inferredTowns,
      inferred_price_band: { min: priceMin, max: priceMax, confidence: priceConfidence },
      inferred_property_type: inferredPropertyType,
      inferred_must_haves: inferredMustHaves,
      inferred_avoid: inferredAvoid,
      urgency: { level: urgencyLevel, reasons: urgencyReasons },
      recommended_next_questions: questions.slice(0, 5),
      suggested_search_seed: suggestedSeed,
    },
    confidence,
    reasons: {
      top_signals: topSignals,
      examples: {
        matched_phrases: [...new Set(matchedPhrases)].slice(0, 15),
        matched_tags: [...new Set(matchedTags)].slice(0, 15),
        matched_links: [...new Set(matchedLinks)].slice(0, 10),
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function mapPropertyType(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('condo')) return 'Condo';
  if (t.includes('town')) return 'Townhouse';
  if (t.includes('multi') || t.includes('duplex')) return 'Multi';
  if (t.includes('land') || t.includes('lot')) return 'Land';
  return 'SFH';
}

function extractTownFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Zillow: /homedetails/<address>-<city>-<state>
    // Redfin: /<state>/<city>/
    const path = u.pathname;
    const segments = path.split('/').filter(Boolean);

    // Try Redfin pattern: /STATE/City/...
    if (segments.length >= 2 && segments[0].length === 2) {
      return segments[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Try Zillow homedetails
    if (path.includes('homedetails')) {
      const parts = segments.find(s => s.includes('-'))?.split('-');
      if (parts && parts.length >= 3) {
        // Typically: street-city-state-zip
        const stateIdx = parts.findIndex(p => p.length === 2 && /^[A-Z]{2}$/i.test(p));
        if (stateIdx > 1) {
          return parts[stateIdx - 1].replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }
  } catch { /* invalid URL */ }
  return null;
}

function extractPriceFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const price = u.searchParams.get('price') || u.searchParams.get('maxPrice') || u.searchParams.get('listPrice');
    if (price) {
      const p = parseInt(price.replace(/[,$]/g, ''));
      if (p > 50000) return p;
    }
  } catch { /* ignore */ }
  return null;
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
