import { useMemo, useState } from 'react';
import {
  Flame, Eye, AlertTriangle,
  ChevronDown, ChevronUp, Target, DollarSign,
  UserCheck, UserX, Zap, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { computeTagScoreAdjustment } from '@/lib/scoring';
import {
  computeOpportunityHeatScore,
  estimateLeadCommission,
  heatLevel,
  type LeadCommissionEstimate,
  type UserCommissionDefaults,
} from '@/lib/leadMoneyModel';
import type { Lead } from '@/types';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { FubPersonProfile } from '@/lib/intelAnalyzer';

// ── Types ────────────────────────────────────────────────────────────

export interface FubActivityRecord {
  activity_type: string;
  direction?: string;
  body_preview?: string;
  subject?: string;
  occurred_at: string;
  duration_seconds?: number;
}

type CommitmentVerdict = 'serious' | 'engaged' | 'browsing' | 'cold';

interface CommitmentSignal {
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // -10 to +10
  reasoning: string;
}

interface CommitmentAssessment {
  verdict: CommitmentVerdict;
  score: number; // 0–100
  signals: CommitmentSignal[];
  summary: string;
  heatScore: number;
  heatReasons: string[];
  commissionEstimate: LeadCommissionEstimate | null;
}

function assessCommitment(
  lead: Lead,
  oppResult: OpportunityHeatResult | null,
  fubProfile: FubPersonProfile | null,
  tasks: { relatedLeadId?: string; completedAt?: string }[],
  fubActivities: FubActivityRecord[],
): CommitmentAssessment {
  const signals: CommitmentSignal[] = [];
  const now = new Date();

  // 1. Temperature signal
  if (lead.leadTemperature === 'hot') {
    signals.push({ label: 'Hot temperature', impact: 'positive', weight: 8, reasoning: 'CRM stage indicates active intent — this person is in buying/selling mode.' });
  } else if (lead.leadTemperature === 'warm') {
    signals.push({ label: 'Warm temperature', impact: 'positive', weight: 4, reasoning: 'Some interest shown but not yet in active decision-making mode.' });
  } else if (lead.leadTemperature === 'cold') {
    signals.push({ label: 'Cold temperature', impact: 'negative', weight: -6, reasoning: 'CRM stage is cold — historically unresponsive or disengaged.' });
  }

  // 2. Tag-based intent analysis
  const tags = lead.statusTags || [];
  if (tags.length > 0) {
    const { adjustment, matchedTags } = computeTagScoreAdjustment(tags);
    const seriousTags = matchedTags.filter(t => {
      const tl = t.toLowerCase();
      return ['pre_approved', 'pre-approved', 'cash_buyer', 'motivated', 'serious', 'appointment set', 'showing', 'mortgage'].some(s => tl.includes(s));
    });
    const browserTags = matchedTags.filter(t => {
      const tl = t.toLowerCase();
      return ['cold', 'tire_kicker', 'not_motivated', 'dead pond', 'unrealistic'].some(s => tl.includes(s));
    });

    if (seriousTags.length > 0) {
      signals.push({
        label: `High-intent tags: ${seriousTags.join(', ')}`,
        impact: 'positive',
        weight: Math.min(seriousTags.length * 3, 9),
        reasoning: `Tags like "${seriousTags[0]}" are strong buying signals — these aren't casual browsers.`,
      });
    }
    if (browserTags.length > 0) {
      signals.push({
        label: `Warning tags: ${browserTags.join(', ')}`,
        impact: 'negative',
        weight: Math.max(browserTags.length * -3, -9),
        reasoning: `Tags like "${browserTags[0]}" suggest this person is not actively in the market or has been unresponsive.`,
      });
    }
  }

  // 3. FUB profile depth — pre-approval, budget, timeframe
  if (fubProfile) {
    if (fubProfile.preApproved) {
      signals.push({ label: 'Pre-approved buyer', impact: 'positive', weight: 9, reasoning: 'Bank-verified purchasing power. This person has done the work to get financing — strong buying commitment.' });
    }
    if (fubProfile.timeFrame) {
      const tf = fubProfile.timeFrame.toLowerCase();
      if (tf.includes('asap') || tf.includes('immediate') || tf.includes('0-3') || tf.includes('now')) {
        signals.push({ label: `Urgent timeline: ${fubProfile.timeFrame}`, impact: 'positive', weight: 7, reasoning: 'Immediate timeline means they need to act soon — high urgency buyer.' });
      } else if (tf.includes('6+') || tf.includes('12') || tf.includes('year') || tf.includes('someday')) {
        signals.push({ label: `Long timeline: ${fubProfile.timeFrame}`, impact: 'negative', weight: -4, reasoning: 'Extended timeline often indicates browsing/researching rather than buying. May not convert for months.' });
      } else {
        signals.push({ label: `Timeline: ${fubProfile.timeFrame}`, impact: 'neutral', weight: 2, reasoning: 'Moderate timeline — interested but not rushing.' });
      }
    }
    if (fubProfile.stage) {
      const s = fubProfile.stage.toLowerCase();
      if (s.includes('active') || s.includes('showing') || s.includes('under contract')) {
        signals.push({ label: `Active FUB stage: ${fubProfile.stage}`, impact: 'positive', weight: 6, reasoning: 'Actively looking or in transaction — requires immediate attention.' });
      }
    }
  }

  // 4. Engagement score — derive from FUB activities if DB value is 0
  const effectiveEngagement = lead.engagementScore > 0
    ? lead.engagementScore
    : Math.min(100, fubActivities.length * 4);

  if (effectiveEngagement >= 50) {
    signals.push({ label: `High engagement (${effectiveEngagement})`, impact: 'positive', weight: 5, reasoning: 'Multiple touchpoints or interactions recorded — this person is actively engaging with you.' });
  } else if (effectiveEngagement > 0 && effectiveEngagement < 20) {
    signals.push({ label: `Low engagement (${effectiveEngagement})`, impact: 'negative', weight: -3, reasoning: 'Minimal interaction history — could be a tire-kicker or early-stage browser.' });
  } else if (effectiveEngagement >= 20 && effectiveEngagement < 50) {
    signals.push({ label: `Moderate engagement (${effectiveEngagement})`, impact: 'neutral', weight: 1, reasoning: 'Some interaction history but not highly active.' });
  }

  // 5. Recency of contact — also check FUB activity timestamps
  const contactDates: number[] = [];
  if (lead.lastContactAt) contactDates.push(new Date(lead.lastContactAt).getTime());
  if (lead.lastTouchedAt) contactDates.push(new Date(lead.lastTouchedAt).getTime());
  if (fubActivities.length > 0) {
    const latestActivity = fubActivities.reduce((latest, a) => {
      const t = new Date(a.occurred_at).getTime();
      return t > latest ? t : latest;
    }, 0);
    if (latestActivity > 0) contactDates.push(latestActivity);
  }
  const mostRecentContact = contactDates.length > 0 ? Math.max(...contactDates) : null;

  if (mostRecentContact) {
    const daysSinceContact = (now.getTime() - mostRecentContact) / (1000 * 60 * 60 * 24);
    if (daysSinceContact <= 2) {
      signals.push({ label: 'Recent contact (< 2 days)', impact: 'positive', weight: 4, reasoning: 'Recently communicated — relationship is active and warm.' });
    } else if (daysSinceContact > 14) {
      signals.push({ label: `No contact in ${Math.round(daysSinceContact)} days`, impact: 'negative', weight: -5, reasoning: `${Math.round(daysSinceContact)} days without contact is a ghosting risk. Serious buyers stay in touch.` });
    } else if (daysSinceContact > 7) {
      signals.push({ label: `Last contact ${Math.round(daysSinceContact)} days ago`, impact: 'negative', weight: -2, reasoning: 'Contact is starting to go stale — follow up before they disengage.' });
    }
  }

  // 6. Has upcoming tasks?
  const hasTask = tasks.some(t => t.relatedLeadId === lead.id && !t.completedAt);
  if (!hasTask) {
    signals.push({ label: 'No scheduled follow-up', impact: 'negative', weight: -2, reasoning: 'No tasks planned means this person could fall through the cracks.' });
  }

  // 7. Lead age vs activity
  if (lead.createdAt) {
    const daysOld = (now.getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld > 90 && effectiveEngagement < 30 && lead.leadTemperature !== 'hot') {
      signals.push({ label: `${Math.round(daysOld)}-day old lead, low engagement`, impact: 'negative', weight: -6, reasoning: 'This lead has been in your pipeline for months with little engagement. Classic "just looking" pattern.' });
    }
  }

  // 8. Source quality
  const source = (lead.source || '').toLowerCase();
  if (source.includes('zillow') || source.includes('realtor')) {
    if (!fubProfile?.preApproved && effectiveEngagement < 30) {
      signals.push({ label: `Portal lead (${lead.source}) — no pre-approval`, impact: 'negative', weight: -3, reasoning: 'Portal leads without pre-approval have historically low conversion rates. Often browsing casually.' });
    }
  }
  if (source.includes('referral') || source.includes('sphere')) {
    signals.push({ label: `Referral/sphere source`, impact: 'positive', weight: 5, reasoning: 'Referrals convert at 3-5x the rate of portal leads — a warm introduction carries weight.' });
  }

  // 9. FUB Activity Pattern Analysis
  if (fubActivities.length > 0) {
    const calls = fubActivities.filter(a => ['call', 'calls', 'phone'].includes(a.activity_type));
    const texts = fubActivities.filter(a => ['text', 'sms', 'textMessage', 'textMessages'].includes(a.activity_type));
    const emails = fubActivities.filter(a => ['email', 'emails'].includes(a.activity_type));
    const showings = fubActivities.filter(a => {
      const t = a.activity_type.toLowerCase();
      const body = (a.body_preview || '').toLowerCase();
      const subj = (a.subject || '').toLowerCase();
      return t.includes('showing') || t.includes('property_visit') || t.includes('viewed') ||
             body.includes('showing') || subj.includes('showing');
    });

    // Showing activity is a strong buying signal
    if (showings.length > 0) {
      signals.push({
        label: `${showings.length} showing${showings.length > 1 ? 's' : ''} / property view${showings.length > 1 ? 's' : ''}`,
        impact: 'positive',
        weight: Math.min(showings.length * 4, 9),
        reasoning: 'Viewing properties in person is one of the strongest commitment signals. People who attend showings are actively searching.',
      });
    }

    // Inbound communication = client initiating contact
    const inboundCount = fubActivities.filter(a => a.direction === 'inbound').length;
    const outboundCount = fubActivities.filter(a => a.direction === 'outbound').length;
    if (inboundCount >= 3) {
      signals.push({
        label: `${inboundCount} inbound messages`,
        impact: 'positive',
        weight: Math.min(inboundCount, 7),
        reasoning: 'Client is initiating contact — strong sign of genuine interest and engagement.',
      });
    } else if (outboundCount >= 5 && inboundCount === 0) {
      signals.push({
        label: `${outboundCount} outbound, 0 inbound`,
        impact: 'negative',
        weight: -5,
        reasoning: 'You\'ve reached out multiple times with no response — classic ghosting pattern.',
      });
    }

    // Call duration analysis
    const answeredCalls = calls.filter(a => a.duration_seconds && a.duration_seconds > 30);
    const missedCalls = calls.filter(a => !a.duration_seconds || a.duration_seconds <= 5);
    if (answeredCalls.length >= 2) {
      const avgDuration = answeredCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / answeredCalls.length;
      if (avgDuration > 120) {
        signals.push({
          label: `${answeredCalls.length} substantial calls (avg ${Math.round(avgDuration / 60)}min)`,
          impact: 'positive',
          weight: 5,
          reasoning: 'Multiple calls with real conversation time indicates active dialogue and serious consideration.',
        });
      }
    }
    if (missedCalls.length >= 3 && answeredCalls.length === 0) {
      signals.push({
        label: `${missedCalls.length} unanswered calls`,
        impact: 'negative',
        weight: -4,
        reasoning: 'Multiple unanswered calls suggest disengagement or avoidance.',
      });
    }

    // Check for cancellation signals in notes/body
    const cancelSignals = fubActivities.filter(a => {
      const body = (a.body_preview || '').toLowerCase();
      const subj = (a.subject || '').toLowerCase();
      return body.includes('cancel') || body.includes('not interested') || body.includes('changed mind') ||
             subj.includes('cancel') || body.includes('postpone') || body.includes('hold off');
    });
    if (cancelSignals.length > 0) {
      signals.push({
        label: `Cancellation/disinterest signals detected`,
        impact: 'negative',
        weight: -6,
        reasoning: 'Activity history contains cancellation or disinterest language — reassess whether to continue investing time.',
      });
    }

    // Total activity volume as a signal
    if (fubActivities.length >= 15) {
      signals.push({
        label: `High activity volume (${fubActivities.length} interactions)`,
        impact: 'positive',
        weight: 3,
        reasoning: 'Significant interaction history suggests this is an active relationship worth maintaining.',
      });
    } else if (fubActivities.length <= 3) {
      signals.push({
        label: `Minimal activity (${fubActivities.length} interaction${fubActivities.length !== 1 ? 's' : ''})`,
        impact: 'negative',
        weight: -2,
        reasoning: 'Very few recorded interactions — relationship hasn\'t developed significantly.',
      });
    }
  } else {
    signals.push({
      label: 'No FUB activity data',
      impact: 'neutral',
      weight: 0,
      reasoning: 'No synced activity history available — assessment based on CRM metadata only.',
    });
  }

  // Compute total score
  const rawScore = signals.reduce((sum, s) => sum + s.weight, 0);
  // Normalize: weights range roughly -30 to +40, map to 0-100
  const normalizedScore = Math.max(0, Math.min(100, Math.round((rawScore + 20) * (100 / 50))));

  // Compute heat score
  const { score: heatScore, reasons: heatReasons } = oppResult
    ? { score: oppResult.opportunityScore, reasons: oppResult.reasons }
    : computeOpportunityHeatScore(lead, hasTask);

  // Commission estimate
  const commissionEstimate = estimateLeadCommission(lead, undefined, fubProfile?.preApprovalAmount ?? null);

  // Verdict
  let verdict: CommitmentVerdict;
  if (normalizedScore >= 70) verdict = 'serious';
  else if (normalizedScore >= 45) verdict = 'engaged';
  else if (normalizedScore >= 25) verdict = 'browsing';
  else verdict = 'cold';

  // Summary
  const positives = signals.filter(s => s.impact === 'positive').length;
  const negatives = signals.filter(s => s.impact === 'negative').length;
  let summary: string;
  if (verdict === 'serious') {
    summary = `Strong buying signals — ${positives} positive indicator${positives !== 1 ? 's' : ''} detected. This person is worth your time and attention.`;
  } else if (verdict === 'engaged') {
    summary = `Mixed signals — showing interest but ${negatives} concern${negatives !== 1 ? 's' : ''} present. Worth qualifying further before investing heavy time.`;
  } else if (verdict === 'browsing') {
    summary = `Likely browsing — ${negatives} warning sign${negatives !== 1 ? 's' : ''} outweigh ${positives} positive signal${positives !== 1 ? 's' : ''}. Consider lower-effort nurture approach.`;
  } else {
    summary = `Low commitment detected — multiple red flags suggest this person is not actively in the market. Minimize time investment.`;
  }

  return { verdict, score: normalizedScore, signals, summary, heatScore, heatReasons, commissionEstimate };
}

// ── Visuals ─────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<CommitmentVerdict, {
  label: string;
  sublabel: string;
  icon: typeof UserCheck;
  ringClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  glowClass: string;
}> = {
  serious: {
    label: 'Serious Buyer',
    sublabel: 'Worth your time',
    icon: UserCheck,
    ringClass: 'text-opportunity',
    bgClass: 'bg-opportunity/10',
    textClass: 'text-opportunity',
    borderClass: 'border-opportunity/30',
    glowClass: 'shadow-[0_0_15px_-3px_hsl(var(--opportunity)/0.3)]',
  },
  engaged: {
    label: 'Engaged — Qualifying',
    sublabel: 'Needs more signals',
    icon: Activity,
    ringClass: 'text-primary',
    bgClass: 'bg-primary/10',
    textClass: 'text-primary',
    borderClass: 'border-primary/30',
    glowClass: 'shadow-[0_0_15px_-3px_hsl(var(--primary)/0.2)]',
  },
  browsing: {
    label: 'Likely Browsing',
    sublabel: 'Low-effort nurture',
    icon: Eye,
    ringClass: 'text-warning',
    bgClass: 'bg-warning/10',
    textClass: 'text-warning',
    borderClass: 'border-warning/30',
    glowClass: 'shadow-[0_0_15px_-3px_hsl(var(--warning)/0.2)]',
  },
  cold: {
    label: 'Cold — Not Serious',
    sublabel: 'Minimize investment',
    icon: UserX,
    ringClass: 'text-urgent',
    bgClass: 'bg-urgent/10',
    textClass: 'text-urgent',
    borderClass: 'border-urgent/30',
    glowClass: 'shadow-[0_0_15px_-3px_hsl(var(--urgent)/0.2)]',
  },
};

// Circular gauge component
function CommitmentGauge({ score, verdict }: { score: number; verdict: CommitmentVerdict }) {
  const config = VERDICT_CONFIG[verdict];
  const circumference = 2 * Math.PI * 42;
  const filled = (score / 100) * circumference;
  const Icon = config.icon;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="110" height="110" viewBox="0 0 100 100" className="transform -rotate-90">
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="6"
        />
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          className={config.ringClass}
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Icon className={cn('h-4 w-4 mb-0.5', config.textClass)} />
        <span className={cn('text-xl font-bold', config.textClass)}>{score}</span>
        <span className="text-[9px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// Signal row
function SignalRow({ signal, index }: { signal: CommitmentSignal; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(v => !v)}
      className="w-full text-left group"
    >
      <div className="flex items-start gap-2.5 py-1.5">
        <div className={cn(
          'mt-1 h-2 w-2 rounded-full shrink-0',
          signal.impact === 'positive' && 'bg-opportunity',
          signal.impact === 'negative' && 'bg-urgent',
          signal.impact === 'neutral' && 'bg-muted-foreground',
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">{signal.label}</span>
            <span className={cn(
              'text-[10px] font-mono shrink-0',
              signal.weight > 0 && 'text-opportunity',
              signal.weight < 0 && 'text-urgent',
              signal.weight === 0 && 'text-muted-foreground',
            )}>
              {signal.weight > 0 ? '+' : ''}{signal.weight}
            </span>
          </div>
          {expanded && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {signal.reasoning}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────

interface Props {
  lead: Lead;
  oppResult: OpportunityHeatResult | null;
  fubProfile: FubPersonProfile | null;
  tasks: { relatedLeadId?: string; completedAt?: string }[];
  fubActivities?: FubActivityRecord[];
}

export function ClientCommitmentPanel({ lead, oppResult, fubProfile, tasks, fubActivities = [] }: Props) {
  const [showAllSignals, setShowAllSignals] = useState(false);
  const [showHeatBreakdown, setShowHeatBreakdown] = useState(false);

  const assessment = useMemo(
    () => assessCommitment(lead, oppResult, fubProfile, tasks, fubActivities),
    [lead, oppResult, fubProfile, tasks, fubActivities],
  );

  const config = VERDICT_CONFIG[assessment.verdict];
  const positiveSignals = assessment.signals.filter(s => s.impact === 'positive');
  const negativeSignals = assessment.signals.filter(s => s.impact === 'negative');
  const neutralSignals = assessment.signals.filter(s => s.impact === 'neutral');
  const displaySignals = showAllSignals ? assessment.signals : assessment.signals.slice(0, 5);

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-4 transition-shadow',
      config.borderClass,
      config.glowClass,
    )}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Flame className={cn('h-4 w-4', config.textClass)} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Commitment Assessment
        </span>
      </div>

      {/* Verdict + Gauge */}
      <div className="flex items-center gap-5">
        <CommitmentGauge score={assessment.score} verdict={assessment.verdict} />
        <div className="flex-1 space-y-2">
          <div>
            <h3 className={cn('text-sm font-bold', config.textClass)}>{config.label}</h3>
            <p className="text-[11px] text-muted-foreground">{config.sublabel}</p>
          </div>
          {/* Quick stat chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium', config.bgClass, config.textClass, config.borderClass)}>
              Heat: {assessment.heatScore}
            </span>
            {assessment.commissionEstimate && assessment.commissionEstimate.estimatedPersonalCommission > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground font-medium">
                Est. ${(assessment.commissionEstimate.estimatedPersonalCommission / 1000).toFixed(0)}K
              </span>
            )}
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-medium',
              positiveSignals.length >= negativeSignals.length
                ? 'bg-opportunity/10 text-opportunity border-opportunity/20'
                : 'bg-urgent/10 text-urgent border-urgent/20',
            )}>
              {positiveSignals.length}↑ {negativeSignals.length}↓
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className={cn('rounded-lg p-3 border', config.bgClass, config.borderClass)}>
        <p className="text-xs leading-relaxed text-foreground/80">
          <span className="font-semibold">Assessment: </span>{assessment.summary}
        </p>
      </div>

      {/* Signals breakdown */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Decision Factors
          <span className="ml-1 text-muted-foreground/50 normal-case font-normal">(tap to expand reasoning)</span>
        </p>

        {/* Positive signals first */}
        {displaySignals
          .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
          .map((signal, i) => (
            <SignalRow key={i} signal={signal} index={i} />
          ))}

        {assessment.signals.length > 5 && (
          <button
            onClick={() => setShowAllSignals(v => !v)}
            className="text-[11px] text-primary hover:underline underline-offset-2 mt-1"
          >
            {showAllSignals ? 'Show less' : `Show all ${assessment.signals.length} factors`}
          </button>
        )}
      </div>

      {/* Heat Score Breakdown */}
      <div className="space-y-2">
        <button
          onClick={() => setShowHeatBreakdown(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-full"
        >
          <Target className="h-3 w-3" />
          Heat Score Breakdown
          {showHeatBreakdown
            ? <ChevronUp className="h-3 w-3 ml-auto" />
            : <ChevronDown className="h-3 w-3 ml-auto" />
          }
        </button>

        {showHeatBreakdown && (
          <div className="space-y-2 pt-1">
            {/* Heat bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    assessment.heatScore >= 60 ? 'bg-urgent' :
                    assessment.heatScore >= 30 ? 'bg-warning' : 'bg-muted-foreground',
                  )}
                  style={{ width: `${assessment.heatScore}%` }}
                />
              </div>
              <span className={cn(
                'text-sm font-bold tabular-nums',
                assessment.heatScore >= 60 ? 'text-urgent' :
                assessment.heatScore >= 30 ? 'text-warning' : 'text-muted-foreground',
              )}>
                {assessment.heatScore}
              </span>
            </div>

            {/* Heat reasons */}
            <div className="space-y-1 pl-1">
              {assessment.heatReasons.map((reason, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <Zap className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            {/* Commission estimate */}
            {assessment.commissionEstimate && (
              <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <DollarSign className="h-3 w-3" /> Commission Estimate
                </div>
                {assessment.commissionEstimate.estimatedPersonalCommission > 0 ? (
                  <>
                    <p className="text-sm font-bold text-foreground">
                      ${assessment.commissionEstimate.estimatedPersonalCommission.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                      {assessment.commissionEstimate.inputsUsed.assumedPrice && (
                        <span>Price: ${(assessment.commissionEstimate.inputsUsed.assumedPrice / 1000).toFixed(0)}K</span>
                      )}
                      {assessment.commissionEstimate.inputsUsed.assumedRate && (
                        <span>• Rate: {assessment.commissionEstimate.inputsUsed.assumedRate}%</span>
                      )}
                      {assessment.commissionEstimate.inputsUsed.assumedSplit && (
                        <span>• Split: {assessment.commissionEstimate.inputsUsed.assumedSplit}%</span>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[9px] mt-1">
                      {assessment.commissionEstimate.confidence} confidence
                    </Badge>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    {assessment.commissionEstimate.warnings[0] || 'No estimate available'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground/50 pt-1 border-t border-border">
        Deterministic analysis · {assessment.signals.length} factors evaluated · No AI used
      </p>
    </div>
  );
}