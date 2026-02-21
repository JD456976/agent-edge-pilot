import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw, Clock, Target, MessageSquare, AlertTriangle, TrendingUp, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface IntelBrief {
  summary: string;
  timeline_highlights: string[];
  motivation_and_intent: string;
  concerns_and_objections: string;
  communication_pattern: string;
  last_meaningful_exchange: string;
  recommended_next_action: string;
  risk_factors: string[];
  opportunity_signals: string[];
}

interface SavedBrief {
  brief_json: IntelBrief;
  activity_count: number;
  generated_at: string;
}

interface Props {
  entityId: string;
  entityType: 'lead' | 'deal';
  entityName: string;
  compact?: boolean;
}

export function IntelBriefPanel({ entityId, entityType, entityName, compact = false }: Props) {
  const { user } = useAuth();
  const [brief, setBrief] = useState<SavedBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Load existing brief
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('intel_briefs' as any)
        .select('brief_json, activity_count, generated_at')
        .eq('user_id', user.id)
        .eq('entity_id', entityId)
        .maybeSingle();
      if (data) setBrief(data as any);
      setLoadingExisting(false);
    })();
  }, [user, entityId]);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('intel-brief', {
        body: { entity_type: entityType, entity_id: entityId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBrief({
        brief_json: data.brief,
        activity_count: data.activity_count,
        generated_at: data.generated_at,
      });
      toast({ title: 'Intel Brief generated', description: `Analyzed ${data.activity_count} events` });
    } catch (err: any) {
      toast({ title: 'Failed to generate brief', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  if (loadingExisting) return null;

  // No brief yet — show generate button
  if (!brief) {
    return (
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Intel Brief</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Analyze all communication history and distill it into actionable intelligence.
        </p>
        <Button size="sm" onClick={generate} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
          {loading ? 'Analyzing…' : 'Generate Intel Brief'}
        </Button>
      </div>
    );
  }

  const b = brief.brief_json;
  const generatedAgo = formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true });

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Intel Brief</span>
          <Badge variant="outline" className="text-[10px]">{brief.activity_count} events</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{generatedAgo}</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={generate} disabled={loading} title="Refresh brief">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Executive Summary */}
        {b.summary && (
          <div className="rounded-md bg-primary/5 border border-primary/10 p-3">
            <p className="text-sm leading-relaxed">{b.summary}</p>
          </div>
        )}

        {/* Recommended Next Action */}
        {b.recommended_next_action && b.recommended_next_action !== 'No data available' && (
          <Section icon={Target} label="Recommended Next Action" accent>
            <p className="text-sm">{b.recommended_next_action}</p>
          </Section>
        )}

        {/* Timeline Highlights */}
        {b.timeline_highlights?.length > 0 && b.timeline_highlights[0] !== 'No data available' && (
          <Section icon={Clock} label="Key Milestones">
            <ul className="space-y-1">
              {b.timeline_highlights.map((h, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="status-dot bg-primary mt-1.5 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Motivation & Intent */}
        {b.motivation_and_intent && b.motivation_and_intent !== 'No data available' && (
          <Section icon={Target} label="Motivation & Intent">
            <p className="text-xs text-muted-foreground">{b.motivation_and_intent}</p>
          </Section>
        )}

        {/* Concerns */}
        {b.concerns_and_objections && b.concerns_and_objections !== 'No data available' && (
          <Section icon={AlertTriangle} label="Concerns & Objections">
            <p className="text-xs text-muted-foreground">{b.concerns_and_objections}</p>
          </Section>
        )}

        {/* Communication Pattern */}
        {b.communication_pattern && b.communication_pattern !== 'No data available' && (
          <Section icon={MessageSquare} label="Communication Pattern">
            <p className="text-xs text-muted-foreground">{b.communication_pattern}</p>
          </Section>
        )}

        {/* Last Meaningful Exchange */}
        {b.last_meaningful_exchange && b.last_meaningful_exchange !== 'No data available' && (
          <Section icon={FileText} label="Last Meaningful Exchange">
            <p className="text-xs text-muted-foreground">{b.last_meaningful_exchange}</p>
          </Section>
        )}

        {/* Risk & Opportunity side-by-side */}
        <div className="grid grid-cols-2 gap-3">
          {b.risk_factors?.length > 0 && b.risk_factors[0] !== 'No data available' && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" /> Risks
              </p>
              <ul className="space-y-1">
                {b.risk_factors.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>
                ))}
              </ul>
            </div>
          )}
          {b.opportunity_signals?.length > 0 && b.opportunity_signals[0] !== 'No data available' && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-opportunity" /> Opportunities
              </p>
              <ul className="space-y-1">
                {b.opportunity_signals.map((s, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
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
