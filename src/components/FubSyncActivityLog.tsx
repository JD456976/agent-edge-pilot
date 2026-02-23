import { useState, useEffect } from 'react';
import { ArrowUpFromLine, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PushLogEntry {
  id: string;
  entity_id: string;
  entity_type: string;
  action: string;
  status: string;
  pushed_at: string;
  error_message: string | null;
  fub_id: string | null;
  fields_pushed: Record<string, unknown> | null;
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const actionLabels: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  note: 'Note pushed',
  complete: 'Completed',
};

export function FubSyncActivityLog() {
  const [entries, setEntries] = useState<PushLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fub_push_log')
      .select('id, entity_id, entity_type, action, status, pushed_at, error_message, fub_id, fields_pushed')
      .order('pushed_at', { ascending: false })
      .limit(50);
    setEntries((data as PushLogEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const displayed = showAll ? entries : entries.slice(0, 10);
  const successCount = entries.filter(e => e.status === 'success').length;
  const failCount = entries.filter(e => e.status !== 'success').length;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Sync Activity Log</p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-500 border-emerald-500/20">
                <CheckCircle2 className="h-2.5 w-2.5" /> {successCount}
              </Badge>
              {failCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/20">
                  <XCircle className="h-2.5 w-2.5" /> {failCount}
                </Badge>
              )}
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={fetchEntries} disabled={loading}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No sync activity yet. Pushes to FUB will appear here.
        </p>
      ) : (
        <div className="space-y-1">
          {displayed.map(entry => {
            const isSuccess = entry.status === 'success';
            const isExpanded = expanded === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
                className="w-full text-left rounded-md border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2 p-2.5">
                  {isSuccess ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">
                        {actionLabels[entry.action] || entry.action}
                      </span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {entry.entity_type}
                      </Badge>
                      {entry.fub_id && (
                        <span className="text-[9px] text-muted-foreground font-mono">
                          #{entry.fub_id}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {getRelativeTime(entry.pushed_at)}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-0 space-y-1.5 border-t border-border mt-0">
                    <div className="pt-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={isSuccess ? 'text-emerald-500' : 'text-destructive'}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground">Time:</span>
                        <span>{new Date(entry.pushed_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground">Entity:</span>
                        <span className="font-mono">{entry.entity_id.slice(0, 8)}…</span>
                      </div>
                      {entry.error_message && (
                        <div className="text-[10px] text-destructive bg-destructive/10 rounded p-1.5 mt-1">
                          {entry.error_message}
                        </div>
                      )}
                      {entry.fields_pushed && Object.keys(entry.fields_pushed).length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          <span className="font-medium">Fields:</span>{' '}
                          {Object.keys(entry.fields_pushed).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {entries.length > 10 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : `Show all ${entries.length} entries`}
        </Button>
      )}
    </div>
  );
}
