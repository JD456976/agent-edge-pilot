import { useState, useEffect } from 'react';
import {
  ShieldCheck, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Clock, TrendingUp, Link, Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SkeletonCard } from '@/components/SkeletonCard';
import { callEdgeFunction } from '@/lib/edgeClient';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { relativeTime } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';

interface ClientFit {
  difficulty_score: number | null;
  time_investment_estimate: 'low' | 'medium' | 'high' | null;
  commission_likelihood: 'low' | 'medium' | 'high' | null;
  agent_recommendation: 'take' | 'nurture' | 'pass' | null;
  red_flags: string[];
  positive_signals: string[];
  reasoning: string;
  insufficient_data: boolean;
  scored_at: string;
}

interface Props {
  entityId: string;
  entityType: 'lead' | 'deal';
  entityName: string;
  entity: any;
}

function RecommendationBadge({ rec }: { rec: 'take' | 'nurture' | 'pass' }) {
  if (rec === 'take') return (
    <Badge variant="opportunity" className="text-[10px] gap-1">
      <CheckCircle2 className="h-3 w-3" /> Strong Fit
    </Badge>
  );
  if (rec === 'nurture') return (
    <Badge variant="warning" className="text-[10px] gap-1">
      <Clock className="h-3 w-3" /> Keep Qualifying
    </Badge>
  );
  return (
    <Badge variant="urgent" className="text-[10px] gap-1">
      <AlertTriangle className="h-3 w-3" /> High Risk
    </Badge>
  );
}

function LevelChip({ label, value }: { label: string; value: 'low' | 'medium' | 'high' }) {
  const color =
    value === 'low' ? 'bg-opportunity/10 text-opportunity border-opportunity/20' :
    value === 'medium' ? 'bg-warning/10 text-warning border-warning/20' :
    'bg-urgent/10 text-urgent border-urgent/20';
  return (
    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', color)}>
      {label}: {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

export function ClientFitPanel({ entityId, entityType, entityName, entity }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fit, setFit] = useState<ClientFit | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [clientIdentityId, setClientIdentityId] = useState<string | null>(null);
  const [noFubLink, setNoFubLink] = useState(false);
  const [showAllFlags, setShowAllFlags] = useState(false);

  const fubId = (() => {
    const src = entity?.importedFrom || entity?.imported_from || '';
    return src.startsWith('fub:') ? src.replace('fub:', '') : null;
  })();

  useEffect(() => {
    if (!fubId || !user) { setNoFubLink(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: ac } = await supabase
          .from('agent_clients')
          .select('client_identity_id')
          .eq('agent_user_id', user.id)
          .eq('fub_contact_id', fubId)
          .maybeSingle();
        if (!ac?.client_identity_id) { setNoFubLink(true); setLoading(false); return; }
        if (!cancelled) setClientIdentityId(ac.client_identity_id);
        const result = await callEdgeFunction('client-analysis', {
          client_identity_id: ac.client_identity_id,
        });
        if (!cancelled && result?.analysis?.client_fit) {
          setFit(result.analysis.client_fit);
          setActivityCount(result.activity_count ?? 0);
          setUpdatedAt(result.updated_at ?? null);
        }
      } catch (err: any) {
        if (!cancelled) toast({ description: err?.message || 'Failed to load client fit', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityId, fubId, user]);

  const handleRefresh = async () => {
    if (!clientIdentityId) return;
    setRefreshing(true);
    try {
      const result = await callEdgeFunction('client-analysis', {
        client_identity_id: clientIdentityId,
        force_refresh: true,
      });
      if (result?.analysis?.client_fit) {
        setFit(result.analysis.client_fit);
        setActivityCount(result.activity_count ?? 0);
        setUpdatedAt(result.updated_at ?? null);
        toast({ description: 'Client fit refreshed' });
      }
    } catch (err: any) {
      toast({ description: err?.message || 'Refresh failed', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  // No FUB link
  if (noFubLink) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Client Fit</span>
          </div>
        </div>
        <div className="mt-2 flex items-start gap-2">
          <Link className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Connect to Follow Up Boss to enable Client Fit scoring.
            This analysis is built entirely from your FUB communication history.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <SkeletonCard lines={3} />;

  const headerContent = (
    <button
      onClick={() => setExpanded(v => !v)}
      className="w-full flex items-center justify-between gap-2 text-left"
    >
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Client Fit</span>
        {fit && !fit.insufficient_data && fit.agent_recommendation && (
          <RecommendationBadge rec={fit.agent_recommendation} />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {updatedAt && (
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(updatedAt)}
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5"
          onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
          disabled={refreshing || !clientIdentityId}
        >
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
        </Button>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        }
      </div>
    </button>
  );

  // Insufficient data
  if (!fit || fit.insufficient_data) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        {headerContent}
        {expanded && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Not enough interaction history to score this client. More FUB activity needed.
          </div>
        )}
      </div>
    );
  }

  const visibleFlags = showAllFlags ? fit.red_flags : fit.red_flags.slice(0, 4);
  const barColor =
    (fit.difficulty_score ?? 0) <= 30 ? 'bg-opportunity' :
    (fit.difficulty_score ?? 0) <= 60 ? 'bg-warning' :
    'bg-urgent';

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {headerContent}

      {expanded && (
        <div className="mt-3 space-y-3">

          {/* Recommendation banner */}
          <div className={cn(
            'text-xs font-medium px-3 py-1.5 rounded-md border',
            fit.agent_recommendation === 'take' && 'bg-opportunity/10 text-opportunity border-opportunity/20',
            fit.agent_recommendation === 'nurture' && 'bg-warning/10 text-warning border-warning/20',
            fit.agent_recommendation === 'pass' && 'bg-urgent/10 text-urgent border-urgent/20',
          )}>
            {fit.agent_recommendation === 'take' && <><CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5" /> Strong Fit — Take On</>}
            {fit.agent_recommendation === 'nurture' && <><Clock className="h-3.5 w-3.5 inline mr-1.5" /> Borderline — Keep Qualifying</>}
            {fit.agent_recommendation === 'pass' && <><AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" /> High Risk — Consider Passing</>}
          </div>

          {/* Difficulty gauge */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Difficulty Score</span>
              <span className="font-medium">{fit.difficulty_score}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${fit.difficulty_score}%` }} />
            </div>
          </div>

          {/* Level chips */}
          <div className="flex flex-wrap gap-1.5">
            {fit.time_investment_estimate && (
              <LevelChip label="Time Investment" value={fit.time_investment_estimate} />
            )}
            {fit.commission_likelihood && (
              <LevelChip label="Commission Likelihood" value={fit.commission_likelihood} />
            )}
          </div>

          {/* Red flags */}
          {fit.red_flags.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-urgent">
                <AlertTriangle className="h-3 w-3" /> Flags
              </div>
              {visibleFlags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="status-dot bg-urgent mt-1.5 shrink-0" />
                  {flag}
                </div>
              ))}
              {fit.red_flags.length > 4 && (
                <button
                  onClick={() => setShowAllFlags(v => !v)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showAllFlags ? 'Show less' : `Show ${fit.red_flags.length - 4} more`}
                </button>
              )}
            </div>
          )}

          {/* Positive signals */}
          {fit.positive_signals.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-opportunity">
                <TrendingUp className="h-3 w-3" /> Signals
              </div>
              {fit.positive_signals.slice(0, 3).map((sig, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="status-dot bg-opportunity mt-1.5 shrink-0" />
                  {sig}
                </div>
              ))}
            </div>
          )}

          {/* Reasoning */}
          <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
            {fit.reasoning}
          </p>

          {/* Footer */}
          <p className="text-[10px] text-muted-foreground/60">
            Scored from {activityCount} FUB interactions · Deterministic analysis
          </p>
        </div>
      )}
    </div>
  );
}
