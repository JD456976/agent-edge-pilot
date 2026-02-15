import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { FubDriftReviewModal } from '@/components/FubDriftReviewModal';

interface DeltaSummary {
  counts: { new: number; updated: number; conflict: number; total: number };
  severity: 'quiet' | 'moderate' | 'attention_needed';
  top_items: any[];
  all_items?: any[];
  checked_at: string;
}

interface FubDriftCardProps {
  hasIntegration: boolean;
}

export function FubDriftCard({ hasIntegration }: FubDriftCardProps) {
  const [summary, setSummary] = useState<DeltaSummary | null>(null);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  // Load cached summary from sync state on mount
  useEffect(() => {
    if (!hasIntegration) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase.from('fub_sync_state' as any)
        .select('last_delta_summary, last_delta_check_at')
        .eq('user_id', user.id)
        .maybeSingle() as any);
      if (data?.last_delta_summary) {
        setSummary(data.last_delta_summary as any);
        setLastCheck(data.last_delta_check_at as string);
      }
    })();
  }, [hasIntegration]);

  const runDeltaCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke('fub-delta', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw new Error(res.error.message || 'Delta check failed');
      const data = res.data as DeltaSummary & { all_items?: any[] };
      setSummary({ counts: data.counts, severity: data.severity, top_items: data.top_items, checked_at: data.checked_at });
      setAllItems(data.all_items || []);
      setLastCheck(data.checked_at);
    } catch (e: any) {
      if (e.message?.includes('rate_limited')) {
        setError('Could not refresh — rate limited. Showing last known state.');
      } else {
        setError(e.message || 'Delta check failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  if (!hasIntegration) return null;

  const severityConfig = {
    quiet: { label: 'Quiet', dotClass: 'bg-opportunity', textClass: 'text-muted-foreground' },
    moderate: { label: 'Moderate', dotClass: 'bg-warning', textClass: 'text-warning' },
    attention_needed: { label: 'Attention Needed', dotClass: 'bg-urgent', textClass: 'text-urgent' },
  };

  const sev = summary ? severityConfig[summary.severity] : null;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">FUB Drift</h2>
            {sev && (
              <div className="flex items-center gap-1.5">
                <span className={`status-dot ${sev.dotClass}`} />
                <span className={`text-xs font-medium ${sev.textClass}`}>{sev.label}</span>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={runDeltaCheck}
            disabled={loading}
            className="h-7 px-2 text-xs"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="ml-1">Check</span>
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive mb-2">{error}</p>
        )}

        {!summary && !loading && !error && (
          <p className="text-xs text-muted-foreground">No drift check run yet. Click Check to scan for changes.</p>
        )}

        {summary && (
          <div className="space-y-2">
            {summary.severity === 'quiet' && summary.counts.total === 0 ? (
              <div className="flex items-center gap-2 py-1">
                <CheckCircle className="h-3.5 w-3.5 text-opportunity" />
                <span className="text-xs text-muted-foreground">No meaningful changes since last check</span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  {summary.counts.new > 0 && (
                    <span className="text-muted-foreground">{summary.counts.new} new</span>
                  )}
                  {summary.counts.updated > 0 && (
                    <span className="text-muted-foreground">{summary.counts.updated} updated</span>
                  )}
                  {summary.counts.conflict > 0 && (
                    <span className="text-urgent">{summary.counts.conflict} potential conflict{summary.counts.conflict !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {summary.top_items && summary.top_items.length > 0 && (
                  <div className="space-y-1">
                    {summary.top_items.slice(0, 2).map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Badge
                          variant={item.status === 'conflict' ? 'urgent' : item.status === 'new' ? 'opportunity' : 'warning'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {item.status === 'conflict' ? 'Conflict' : item.status === 'new' ? 'New' : 'Updated'}
                        </Badge>
                        <span className="truncate text-muted-foreground">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs h-7 mt-1"
                  onClick={() => {
                    if (allItems.length === 0 && summary.top_items) {
                      setAllItems(summary.top_items);
                    }
                    setShowReview(true);
                  }}
                >
                  Review changes <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </>
            )}

            {lastCheck && (
              <p className="text-[10px] text-muted-foreground">Last checked: {formatTime(lastCheck)}</p>
            )}
          </div>
        )}
      </div>

      {showReview && (
        <FubDriftReviewModal
          items={allItems}
          onClose={() => setShowReview(false)}
          onRefresh={runDeltaCheck}
        />
      )}
    </>
  );
}
