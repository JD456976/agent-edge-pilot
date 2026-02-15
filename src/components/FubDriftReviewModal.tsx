import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertTriangle, ArrowRight, Eye, ChevronDown, Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { callEdgeFunction, type EdgeFunctionError } from '@/lib/edgeClient';
import { EdgeErrorDisplay } from '@/components/EdgeErrorDisplay';

interface DeltaChange {
  field: string;
  fub_value: string;
  local_value?: string;
  safe: boolean;
}

interface DeltaItem {
  entity_type: string;
  fub_id: string;
  label: string;
  status: 'new' | 'updated' | 'conflict';
  changes: string[];
  field_diffs?: DeltaChange[];
  fub_updated: string;
  local_modified?: string;
  urgency: number;
}

interface DeltaSummary {
  counts: { new: number; updated: number; conflict?: number; conflicts?: number; total: number };
  severity: 'quiet' | 'moderate' | 'attention_needed';
  drift_reason?: string;
  top_items?: any[];
  checked_at?: string | null;
}

interface Props {
  items: DeltaItem[];
  summary: DeltaSummary | null;
  lastCheck: string | null;
  lastSuccessfulCheck: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onScopedStageComplete?: (runId: string) => void;
}

const STATUS_CONFIG = {
  new: { label: 'New', variant: 'opportunity' as const },
  updated: { label: 'Updated', variant: 'warning' as const },
  conflict: { label: 'Potential Conflict', variant: 'urgent' as const },
};

const MAX_SCOPED_PER_TYPE = 50;

export function FubDriftReviewModal({ items, summary, lastCheck, lastSuccessfulCheck, onClose, onRefresh, onScopedStageComplete }: Props) {
  const [ignoringIds, setIgnoringIds] = useState<Set<string>>(new Set());
  const [watchingIds, setWatchingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [staging, setStaging] = useState(false);
  const [stageError, setStageError] = useState<EdgeFunctionError | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const [showLimitPrompt, setShowLimitPrompt] = useState(false);

  const leads = items.filter(i => i.entity_type === 'lead');
  const deals = items.filter(i => i.entity_type === 'deal');
  const tasks = items.filter(i => i.entity_type === 'task');

  const itemKey = (item: DeltaItem) => `${item.entity_type}:${item.fub_id}`;

  const toggleSelect = (item: DeltaItem) => {
    const key = itemKey(item);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (list: DeltaItem[]) => {
    const keys = list.map(itemKey);
    const allSelected = keys.every(k => selectedIds.has(k));
    setSelectedIds(prev => {
      const next = new Set(prev);
      keys.forEach(k => allSelected ? next.delete(k) : next.add(k));
      return next;
    });
  };

  // Build selected FUB IDs grouped by type
  const getSelectedByType = () => {
    const selected = { leads: [] as string[], deals: [] as string[], tasks: [] as string[] };
    for (const key of selectedIds) {
      const [type, fubId] = key.split(':');
      if (type === 'lead') selected.leads.push(fubId);
      else if (type === 'deal') selected.deals.push(fubId);
      else if (type === 'task') selected.tasks.push(fubId);
    }
    return selected;
  };

  const exceedsLimit = () => {
    const sel = getSelectedByType();
    return sel.leads.length > MAX_SCOPED_PER_TYPE ||
           sel.deals.length > MAX_SCOPED_PER_TYPE ||
           sel.tasks.length > MAX_SCOPED_PER_TYPE;
  };

  const handleIgnore = useCallback(async (item: DeltaItem, scope: 'item' | 'type' | 'field_rule') => {
    const key = itemKey(item);
    setIgnoringIds(prev => new Set(prev).add(key));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const expiresAt = scope === 'type'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await supabase.from('fub_ignored_changes' as any).insert({
        user_id: user.id,
        entity_type: item.entity_type,
        fub_id: scope === 'type' ? '*' : item.fub_id,
        scope,
        expires_at: expiresAt,
        field_rule: scope === 'field_rule' ? { ignore_formatting: true } : null,
      });

      const messages: Record<string, string> = {
        item: `Ignored "${item.label}" for 7 days.`,
        type: `Ignoring all ${item.entity_type} changes for 24 hours.`,
        field_rule: `Ignoring low-signal ${item.entity_type} changes for 7 days.`,
      };
      toast({ description: messages[scope], duration: 2500 });
    } catch {
      toast({ description: 'Failed to ignore.', duration: 2000 });
    }
  }, []);

  const handleWatch = useCallback(async (item: DeltaItem) => {
    const key = itemKey(item);
    setWatchingIds(prev => new Set(prev).add(key));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('fub_watchlist' as any).insert({
        user_id: user.id,
        entity_type: item.entity_type,
        fub_id: item.fub_id,
        label: item.label,
      });
      toast({ description: `"${item.label}" added to watchlist.`, duration: 2000 });
    } catch {
      toast({ description: 'Failed to add to watchlist.', duration: 2000 });
    }
  }, []);

  const doScopedStage = useCallback(async (mode: 'selected' | 'full') => {
    setStaging(true);
    setShowLimitPrompt(false);
    setStageError(null);
    try {
      let reqBody: any;
      if (mode === 'selected') {
        const selected = getSelectedByType();
        selected.leads = selected.leads.slice(0, MAX_SCOPED_PER_TYPE);
        selected.deals = selected.deals.slice(0, MAX_SCOPED_PER_TYPE);
        selected.tasks = selected.tasks.slice(0, MAX_SCOPED_PER_TYPE);
        reqBody = { scope: "selected", selected };
      } else {
        reqBody = { limit: 50 };
      }

      const data = await callEdgeFunction<any>('fub-stage', reqBody);

      const runId = data.import_run_id;
      const notFound = data.not_found || [];
      const staged = data.counts;

      const totalStaged = (staged?.leads?.total || 0) + (staged?.deals?.total || 0) + (staged?.tasks?.total || 0);

      let desc = `Scoped staging complete. ${totalStaged} item${totalStaged !== 1 ? 's' : ''} staged.`;
      if (notFound.length > 0) {
        desc += ` ${notFound.length} item${notFound.length !== 1 ? 's' : ''} not found in FUB.`;
      }
      toast({ description: desc, duration: 4000 });

      onClose();
      onScopedStageComplete?.(runId);
    } catch (e: any) {
      if (e?.kind) {
        setStageError(e);
      }
      toast({ description: e?.message || 'Staging failed.', duration: 3000 });
    } finally {
      setStaging(false);
    }
  }, [selectedIds, onClose, onScopedStageComplete]);

  const handleStageSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (exceedsLimit()) {
      setShowLimitPrompt(true);
      return;
    }
    doScopedStage('selected');
  }, [selectedIds, doScopedStage]);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const toggleDiffExpanded = (key: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderFieldDiffs = (item: DeltaItem) => {
    const diffs = item.field_diffs || [];
    if (diffs.length === 0) return null;
    const key = itemKey(item);
    const expanded = expandedDiffs.has(key);

    return (
      <div className="space-y-1">
        <button
          onClick={() => toggleDiffExpanded(key)}
          className="text-[10px] text-primary hover:text-primary/80 underline"
        >
          {expanded ? 'Hide' : 'Show'} field details ({diffs.length})
        </button>
        {expanded && (
          <div className="space-y-1 mt-1">
            {diffs.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] p-1.5 rounded bg-muted/30">
                <div className="flex items-center gap-1 shrink-0">
                  {d.safe ? (
                    <ShieldCheck className="h-3 w-3 text-opportunity" />
                  ) : (
                    <Shield className="h-3 w-3 text-warning" />
                  )}
                  <span className={`font-medium ${d.safe ? 'text-foreground' : 'text-warning'}`}>
                    {d.field}
                  </span>
                  <span className={`text-[9px] px-1 py-0 rounded ${d.safe ? 'bg-opportunity/10 text-opportunity' : 'bg-warning/10 text-warning'}`}>
                    {d.safe ? 'Safe' : 'Protected'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">FUB:</span>
                    <span className="truncate">{d.fub_value || '—'}</span>
                  </div>
                  {d.local_value && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Local:</span>
                      <span className="truncate">{d.local_value}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderItems = (list: DeltaItem[], showSelectAll = false) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-6">No changes detected</p>;
    }
    return (
      <div className="space-y-2">
        {showSelectAll && list.length > 1 && (
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <Checkbox
              checked={list.every(i => selectedIds.has(itemKey(i)))}
              onCheckedChange={() => toggleSelectAll(list)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] text-muted-foreground">Select all ({list.length})</span>
          </div>
        )}
        {list.map((item) => {
          const cfg = STATUS_CONFIG[item.status];
          const key = itemKey(item);
          const isIgnored = ignoringIds.has(key);
          const isWatched = watchingIds.has(key);
          const isSelected = selectedIds.has(key);
          return (
            <div
              key={key}
              className={`p-3 rounded-md border border-border bg-card/50 space-y-2 transition-opacity ${isIgnored ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!isIgnored && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(item)}
                    className="h-3.5 w-3.5 mt-0.5 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0 shrink-0">{cfg.label}</Badge>
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                    <span>FUB: {formatDate(item.fub_updated)}</span>
                    {item.local_modified && <span>Local: {formatDate(item.local_modified)}</span>}
                  </div>
                </div>
              </div>

              {renderFieldDiffs(item)}

              {(!item.field_diffs || item.field_diffs.length === 0) && item.changes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.changes.map((c, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
                  ))}
                </div>
              )}

              {item.status === 'conflict' && (
                <div className="text-[11px] text-warning italic border-l-2 border-warning/30 pl-2 space-y-0.5">
                  <p>This record was edited locally after import and also changed in FUB.</p>
                  <p className="text-muted-foreground">Default: Keep Deal Pilot version. Use field details to selectively accept safe fields.</p>
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                {!isIgnored && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                        Ignore <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="text-xs">
                      <DropdownMenuItem onClick={() => handleIgnore(item, 'item')}>
                        Ignore this item (7 days)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleIgnore(item, 'type')}>
                        Ignore all {item.entity_type}s (24h)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleIgnore(item, 'field_rule')}>
                        Ignore low-signal changes (7 days)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {!isWatched && !isIgnored && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => handleWatch(item)}>
                    <Eye className="h-3 w-3 mr-0.5" /> Watch
                  </Button>
                )}
                {isIgnored && <span className="text-[10px] text-muted-foreground italic">Ignored</span>}
                {isWatched && <span className="text-[10px] text-muted-foreground italic">Watching</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review FUB Changes</DialogTitle>
          <DialogDescription className="space-y-1">
            <span>Changes detected in Follow Up Boss since your last sync. Review and decide how to proceed.</span>
            <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
              {lastCheck && <span>Last checked: {formatDate(lastCheck)}</span>}
              {lastSuccessfulCheck && <span>Last successful: {formatDate(lastSuccessfulCheck)}</span>}
              {summary?.drift_reason && <span className="italic">{summary.drift_reason}</span>}
            </span>
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No changes to review.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-2 text-xs">
                <span className="text-muted-foreground">{items.length} total change{items.length !== 1 ? 's' : ''}</span>
                {items.filter(i => i.status === 'conflict').length > 0 && (
                  <span className="text-urgent flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {items.filter(i => i.status === 'conflict').length} conflict{items.filter(i => i.status === 'conflict').length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={handleStageSelected}
                  disabled={staging}
                >
                  {staging ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Stage {selectedIds.size} selected
                </Button>
              )}
            </div>

            {/* Stage error display */}
            {stageError && (
              <div className="mb-2">
                <EdgeErrorDisplay error={stageError} functionName="fub-stage" />
              </div>
            )}

            {/* Limit prompt */}
            {showLimitPrompt && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2 text-sm">
                <p className="text-muted-foreground">
                  That's a lot for one run. More than {MAX_SCOPED_PER_TYPE} items of a single type were selected.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => doScopedStage('selected')} disabled={staging}>
                    {staging && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Stage first {MAX_SCOPED_PER_TYPE} per type
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => doScopedStage('full')} disabled={staging}>
                    {staging && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Stage all in full mode
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowLimitPrompt(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <Tabs defaultValue="all">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">All ({items.length})</TabsTrigger>
                <TabsTrigger value="leads" className="flex-1">Leads ({leads.length})</TabsTrigger>
                <TabsTrigger value="deals" className="flex-1">Deals ({deals.length})</TabsTrigger>
                <TabsTrigger value="tasks" className="flex-1">Tasks ({tasks.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all">{renderItems(items, true)}</TabsContent>
              <TabsContent value="leads">{renderItems(leads, true)}</TabsContent>
              <TabsContent value="deals">{renderItems(deals, true)}</TabsContent>
              <TabsContent value="tasks">{renderItems(tasks, true)}</TabsContent>
            </Tabs>
          </>
        )}

        <div className="flex justify-between pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" variant="outline" onClick={() => { onClose(); onRefresh(); }}>
            <ArrowRight className="h-3 w-3 mr-1" /> Re-check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
