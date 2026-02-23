import React, { useState } from 'react';
import {
  MapPin, DollarSign, Home, Heart, ShieldAlert, Gauge, HelpCircle,
  ChevronDown, ThumbsUp, ThumbsDown, Pencil, RefreshCw, Lightbulb,
  Target, AlertTriangle, CheckCircle2, Eye
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePreferenceProfile } from '@/hooks/usePreferenceProfile';
import type { FubActivity, FubPersonProfile } from '@/lib/intelAnalyzer';
import type { PreferenceResult, ScoredItem } from '@/lib/preferenceEngine';

interface Props {
  entityId: string;
  entityType: 'lead' | 'deal';
  entityName: string;
  entity: any;
  fubActivities: FubActivity[];
  personProfile: FubPersonProfile | null;
}

export function ClientPreferencesPanel({ entityId, entityType, entityName, entity, fubActivities, personProfile }: Props) {
  const { result, loading, saving, recompute, submitFeedback } = usePreferenceProfile({
    entityId, entityType, entity, fubActivities, personProfile,
  });
  const [showWhySection, setShowWhySection] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  if (loading && !result) {
    return (
      <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-4 flex items-center justify-center gap-2">
        <Target className="h-4 w-4 animate-pulse text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Computing preferences…</span>
      </div>
    );
  }

  if (!result) return null;

  const { profile, confidence, reasons } = result;
  const needsConfirmation = confidence < 0.45;

  return (
    <div className="rounded-lg border-2 border-accent/30 bg-accent/5 space-y-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-accent/20">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent-foreground" />
          <span className="text-sm font-semibold">Client Preferences</span>
          <ConfidenceBadge confidence={confidence} />
          {needsConfirmation && (
            <Badge variant="outline" className="text-[9px] border-warning text-warning">
              Needs confirmation
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>}
          <button
            onClick={recompute}
            disabled={loading}
            className="p-1 rounded hover:bg-accent/30 transition-colors disabled:opacity-50"
            title="Recompute preferences"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Urgency Meter */}
        <UrgencyMeter urgency={profile.urgency} />

        {/* Top Towns */}
        {profile.inferred_towns.length > 0 && (
          <PreferenceSection icon={MapPin} label="Preferred Areas">
            <div className="flex flex-wrap gap-1.5">
              {profile.inferred_towns.slice(0, 5).map((town) => (
                <TownChip
                  key={town.name}
                  town={town}
                  onConfirm={() => submitFeedback('town', { name: town.name }, 'confirm')}
                  onReject={() => submitFeedback('town', { name: town.name }, 'reject')}
                />
              ))}
            </div>
          </PreferenceSection>
        )}

        {/* Price Band */}
        {(profile.inferred_price_band.min || profile.inferred_price_band.max) && (
          <PreferenceSection icon={DollarSign} label="Price Range">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {formatPriceBand(profile.inferred_price_band.min, profile.inferred_price_band.max)}
              </span>
              <ConfidenceDot confidence={profile.inferred_price_band.confidence} />
            </div>
          </PreferenceSection>
        )}

        {/* Property Type */}
        {profile.inferred_property_type.length > 0 && profile.inferred_property_type[0].type !== 'Unknown' && (
          <PreferenceSection icon={Home} label="Property Type">
            <div className="flex flex-wrap gap-1.5">
              {profile.inferred_property_type.slice(0, 3).map((pt) => (
                <span
                  key={pt.type}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1"
                >
                  {pt.type}
                  <ScorePip score={pt.score} />
                </span>
              ))}
            </div>
          </PreferenceSection>
        )}

        {/* Must-haves */}
        {profile.inferred_must_haves.length > 0 && (
          <PreferenceSection icon={Heart} label="Must-Haves">
            <div className="flex flex-wrap gap-1.5">
              {profile.inferred_must_haves.slice(0, 5).map((mh) => (
                <FeedbackChip
                  key={mh.name}
                  label={mh.name}
                  score={mh.score}
                  onConfirm={() => submitFeedback('must_have', mh.name, 'confirm')}
                  onReject={() => submitFeedback('must_have', mh.name, 'reject')}
                />
              ))}
            </div>
          </PreferenceSection>
        )}

        {/* Avoid */}
        {profile.inferred_avoid.length > 0 && (
          <PreferenceSection icon={ShieldAlert} label="Avoid">
            <div className="flex flex-wrap gap-1.5">
              {profile.inferred_avoid.map((a) => (
                <span key={a.name} className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                  {a.name}
                </span>
              ))}
            </div>
          </PreferenceSection>
        )}

        {/* Next Best Questions */}
        {profile.recommended_next_questions.length > 0 && (
          <div>
            <button
              onClick={() => setShowQuestions(!showQuestions)}
              className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors font-medium uppercase tracking-wider"
            >
              <Lightbulb className="h-3 w-3" />
              Suggested Questions ({profile.recommended_next_questions.length})
              <ChevronDown className={`h-3 w-3 transition-transform ${showQuestions ? 'rotate-180' : ''}`} />
            </button>
            {showQuestions && (
              <div className="mt-2 space-y-1.5">
                {profile.recommended_next_questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-foreground bg-background/50 rounded-md px-3 py-2 border border-border">
                    <HelpCircle className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Why We Think This */}
        <div>
          <button
            onClick={() => setShowWhySection(!showWhySection)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium uppercase tracking-wider"
          >
            <Eye className="h-3 w-3" />
            Why we think this
            <ChevronDown className={`h-3 w-3 transition-transform ${showWhySection ? 'rotate-180' : ''}`} />
          </button>
          {showWhySection && (
            <div className="mt-2 space-y-2">
              {reasons.top_signals.slice(0, 6).map((sig, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-muted-foreground font-mono">+{sig.weight}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{sig.signal}</span>
                    <span className="text-muted-foreground"> — {sig.evidence}</span>
                  </div>
                </div>
              ))}

              {reasons.examples.matched_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider w-full">Matched tags:</span>
                  {reasons.examples.matched_tags.slice(0, 8).map((t, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t}</span>
                  ))}
                </div>
              )}

              {reasons.examples.matched_links.length > 0 && (
                <div className="mt-1">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-1">Matched links:</span>
                  {reasons.examples.matched_links.slice(0, 3).map((l, i) => (
                    <div key={i} className="text-[10px] text-primary truncate">{l}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function PreferenceSection({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {children}
    </div>
  );
}

function UrgencyMeter({ urgency }: { urgency: { level: 'low' | 'medium' | 'high'; reasons: string[] } }) {
  const config = {
    low: { color: 'bg-muted', text: 'text-muted-foreground', label: 'Low Urgency', icon: '🟢' },
    medium: { color: 'bg-warning/20', text: 'text-warning', label: 'Medium Urgency', icon: '🟡' },
    high: { color: 'bg-destructive/10', text: 'text-destructive', label: 'High Urgency', icon: '🔴' },
  }[urgency.level];

  return (
    <div className={`rounded-md ${config.color} px-3 py-2`}>
      <div className="flex items-center gap-2">
        <Gauge className={`h-3.5 w-3.5 ${config.text}`} />
        <span className={`text-xs font-semibold ${config.text}`}>{config.icon} {config.label}</span>
      </div>
      {urgency.reasons.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {urgency.reasons.map((r, i) => (
            <span key={i} className="text-[10px] text-muted-foreground">{i > 0 ? '· ' : ''}{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TownChip({ town, onConfirm, onReject }: { town: ScoredItem; onConfirm: () => void; onReject: () => void }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={() => setShowActions(!showActions)}
        className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1 hover:bg-primary/20 transition-colors"
      >
        <MapPin className="h-2.5 w-2.5" />
        {town.name}
        <ScorePip score={town.score} />
      </button>
      {showActions && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-popover border border-border rounded-md shadow-md p-1 z-20">
          <button onClick={() => { onConfirm(); setShowActions(false); }} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Confirm">
            <ThumbsUp className="h-3 w-3 text-primary" />
          </button>
          <button onClick={() => { onReject(); setShowActions(false); }} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Remove">
            <ThumbsDown className="h-3 w-3 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
}

function FeedbackChip({ label, score, onConfirm, onReject }: { label: string; score: number; onConfirm: () => void; onReject: () => void }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={() => setShowActions(!showActions)}
        className="text-[11px] px-2.5 py-1 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-1 hover:bg-accent/80 transition-colors"
      >
        {label}
        <ScorePip score={score} />
      </button>
      {showActions && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-popover border border-border rounded-md shadow-md p-1 z-20">
          <button onClick={() => { onConfirm(); setShowActions(false); }} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Confirm">
            <ThumbsUp className="h-3 w-3 text-primary" />
          </button>
          <button onClick={() => { onReject(); setShowActions(false); }} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Remove">
            <ThumbsDown className="h-3 w-3 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const variant = pct >= 60 ? 'text-primary' : pct >= 40 ? 'text-warning' : 'text-muted-foreground';
  return (
    <span className={`text-[10px] font-mono ${variant}`}>
      {pct}%
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 0.7 ? 'bg-primary' : confidence >= 0.4 ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`${Math.round(confidence * 100)}% confident`} />
  );
}

function ScorePip({ score }: { score: number }) {
  if (score < 3) return null;
  const dots = Math.min(Math.floor(score / 5), 3);
  return (
    <span className="flex items-center gap-[2px] ml-0.5">
      {Array.from({ length: dots }).map((_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-primary/60" />
      ))}
    </span>
  );
}

function formatPriceBand(min: number | null, max: number | null): string {
  if (min && max && min !== max) return `$${fmtK(min)} – $${fmtK(max)}`;
  if (min) return `~$${fmtK(min)}`;
  if (max) return `Up to $${fmtK(max)}`;
  return 'Unknown';
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}
