import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Plus, SkipForward, Link, XCircle, Info } from 'lucide-react';
import { ImportCompletionModal, type ImportResult } from '@/components/ImportCompletionModal';
import { markImportCompleted } from '@/hooks/useImportHighlight';

interface ImportReviewProps {
  runId: string;
  onBack: () => void;
}

type MatchFilter = 'all' | 'new' | 'matched' | 'conflict';

export function FubImportReview({ runId, onBack }: ImportReviewProps) {
  const { isReviewer, logAdminAction } = useAuth();
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [completionResult, setCompletionResult] = useState<ImportResult | null>(null);
  const [run, setRun] = useState<any>(null);
  const commitStartTime = useRef<number>(0);
  const [stagedLeads, setStagedLeads] = useState<any[]>([]);
  const [stagedDeals, setStagedDeals] = useState<any[]>([]);
  const [stagedTasks, setStagedTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<MatchFilter>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: runData }, { data: leads }, { data: deals }, { data: tasks }] = await Promise.all([
      supabase.from('fub_import_runs' as any).select('*').eq('id', runId).single(),
      supabase.from('fub_staged_leads' as any).select('*').eq('import_run_id', runId).order('created_at'),
      supabase.from('fub_staged_deals' as any).select('*').eq('import_run_id', runId).order('created_at'),
      supabase.from('fub_staged_tasks' as any).select('*').eq('import_run_id', runId).order('created_at'),
    ]);
    setRun(runData);
    setStagedLeads(leads || []);
    setStagedDeals(deals || []);
    setStagedTasks(tasks || []);
    setLoading(false);
  }, [runId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateResolution = async (table: string, id: string, resolution: string) => {
    await supabase.from(table as any).update({ resolution }).eq('id', id);
    await loadData();
  };

  const handleCommit = async () => {
    setCommitting(true);
    commitStartTime.current = Date.now();
    try {
      const res = await supabase.functions.invoke('fub-commit', {
        body: { import_run_id: runId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const durationMs = Date.now() - commitStartTime.current;
      const committed = res.data.committed;

      // Calculate skipped and matched from staged data
      const skippedLeads = stagedLeads.filter(l => (l.resolution || (l.match_status === 'conflict' ? null : undefined)) === 'skip').length;
      const skippedDeals = stagedDeals.filter(d => (d.resolution || (d.match_status === 'conflict' ? null : undefined)) === 'skip').length;
      const skippedTasks = stagedTasks.filter(t => (t.resolution || (t.match_status === 'conflict' ? null : undefined)) === 'skip').length;
      const matchedLeads = stagedLeads.filter(l => l.match_status === 'matched').length;
      const matchedDeals = stagedDeals.filter(d => d.match_status === 'matched').length;
      const matchedTasks = stagedTasks.filter(t => t.match_status === 'matched').length;

      // Mark import completed for Command Center badge
      if (!isReviewer) {
        markImportCompleted();
      }

      setCompletionResult({
        committed,
        skipped: { leads: skippedLeads, deals: skippedDeals, tasks: skippedTasks },
        matched: { leads: matchedLeads, deals: matchedDeals, tasks: matchedTasks },
        isReviewer,
        durationMs,
      });

      await loadData();
    } catch (err: any) {
      toast({ title: 'Commit failed', description: err.message, variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await supabase.from('fub_import_runs' as any).update({ status: 'cancelled' }).eq('id', runId);
      await logAdminAction('import_cancelled', { import_run_id: runId });
      toast({ title: 'Import run cancelled' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const filterItems = (items: any[]) =>
    filter === 'all' ? items : items.filter(i => i.match_status === filter);

  const countByStatus = (items: any[]) => ({
    new: items.filter(i => i.match_status === 'new').length,
    matched: items.filter(i => i.match_status === 'matched').length,
    conflict: items.filter(i => i.match_status === 'conflict').length,
  });

  const unresolvedConflicts = [
    ...stagedLeads.filter(l => l.match_status === 'conflict' && !l.resolution),
    ...stagedDeals.filter(d => d.match_status === 'conflict' && !d.resolution),
    ...stagedTasks.filter(t => t.match_status === 'conflict' && !t.resolution),
  ].length;

  // Show completion modal after successful commit
  if (completionResult) {
    return (
      <ImportCompletionModal
        result={completionResult}
        onViewHistory={onBack}
        onClose={() => {
          setCompletionResult(null);
          // Stay on review screen to view imported items
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isTerminal = run?.status === 'committed' || run?.status === 'cancelled' || run?.status === 'failed';
  const leadCounts = countByStatus(stagedLeads);
  const dealCounts = countByStatus(stagedDeals);
  const taskCounts = countByStatus(stagedTasks);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'new': return <Badge variant="outline" className="text-xs"><Plus className="h-3 w-3 mr-1" />New</Badge>;
      case 'matched': return <Badge className="bg-primary/20 text-primary border-primary/30 text-xs"><Link className="h-3 w-3 mr-1" />Matched</Badge>;
      case 'conflict': return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Conflict</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const resolutionSelect = (table: string, item: any) => {
    if (item.match_status !== 'conflict' || isTerminal) return null;
    return (
      <Select
        value={item.resolution || ''}
        onValueChange={(v) => updateResolution(table, item.id, v)}
      >
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue placeholder="Resolve…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="create_new">Create New</SelectItem>
          <SelectItem value="match_existing">Match Existing</SelectItem>
          <SelectItem value="skip">Skip</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Import Review</h1>
          <p className="text-sm text-muted-foreground">
            Run {runId.slice(0, 8)}… •{' '}
            <Badge variant={run?.status === 'committed' ? 'default' : run?.status === 'cancelled' ? 'secondary' : 'outline'} className="text-xs">
              {run?.status}
            </Badge>
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{stagedLeads.length}</p>
          <p className="text-xs text-muted-foreground">Leads</p>
          <div className="flex justify-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">{leadCounts.new} new</span>
            <span className="text-xs text-muted-foreground">• {leadCounts.matched} matched</span>
            <span className="text-xs text-muted-foreground">• {leadCounts.conflict} conflict</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{stagedDeals.length}</p>
          <p className="text-xs text-muted-foreground">Deals</p>
          <div className="flex justify-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">{dealCounts.new} new</span>
            <span className="text-xs text-muted-foreground">• {dealCounts.matched} matched</span>
            <span className="text-xs text-muted-foreground">• {dealCounts.conflict} conflict</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{stagedTasks.length}</p>
          <p className="text-xs text-muted-foreground">Tasks</p>
          <div className="flex justify-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">{taskCounts.new} new</span>
            <span className="text-xs text-muted-foreground">• {taskCounts.matched} matched</span>
            <span className="text-xs text-muted-foreground">• {taskCounts.conflict} conflict</span>
          </div>
        </div>
      </div>

      {/* Reviewer warning */}
      {isReviewer && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 mb-4 flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Review mode: imports disabled.</span>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {(['all', 'new', 'matched', 'conflict'] as MatchFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="leads" className="mb-6">
        <TabsList className="w-full">
          <TabsTrigger value="leads" className="flex-1">Leads ({filterItems(stagedLeads).length})</TabsTrigger>
          <TabsTrigger value="deals" className="flex-1">Deals ({filterItems(stagedDeals).length})</TabsTrigger>
          <TabsTrigger value="tasks" className="flex-1">Tasks ({filterItems(stagedTasks).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>FUB ID</TableHead>
                <TableHead>Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filterItems(stagedLeads).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No items</TableCell></TableRow>
              ) : filterItems(stagedLeads).map(l => (
                <TableRow key={l.id}>
                  <TableCell>{statusBadge(l.match_status)}</TableCell>
                  <TableCell className="font-medium">{(l.normalized as any)?.name || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(l.normalized as any)?.source || '—'}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{l.fub_id}</TableCell>
                  <TableCell>{resolutionSelect('fub_staged_leads', l)}{l.resolution && <span className="text-xs text-muted-foreground ml-1">{l.resolution}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="deals">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>FUB ID</TableHead>
                <TableHead>Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filterItems(stagedDeals).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No items</TableCell></TableRow>
              ) : filterItems(stagedDeals).map(d => (
                <TableRow key={d.id}>
                  <TableCell>{statusBadge(d.match_status)}</TableCell>
                  <TableCell className="font-medium">{(d.normalized as any)?.title || '—'}</TableCell>
                  <TableCell className="text-xs">${((d.normalized as any)?.price || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{d.fub_id}</TableCell>
                  <TableCell>{resolutionSelect('fub_staged_deals', d)}{d.resolution && <span className="text-xs text-muted-foreground ml-1">{d.resolution}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="tasks">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>FUB ID</TableHead>
                <TableHead>Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filterItems(stagedTasks).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No items</TableCell></TableRow>
              ) : filterItems(stagedTasks).map(t => (
                <TableRow key={t.id}>
                  <TableCell>{statusBadge(t.match_status)}</TableCell>
                  <TableCell className="font-medium">{(t.normalized as any)?.title || '—'}</TableCell>
                  <TableCell className="text-xs">{(t.normalized as any)?.type || '—'}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{t.fub_id}</TableCell>
                  <TableCell>{resolutionSelect('fub_staged_tasks', t)}{t.resolution && <span className="text-xs text-muted-foreground ml-1">{t.resolution}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      {!isTerminal && (
        <div className="flex gap-3">
          <Button
            onClick={handleCommit}
            disabled={committing || isReviewer || unresolvedConflicts > 0}
            className="flex-1"
          >
            {committing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Commit Import
            {unresolvedConflicts > 0 && ` (${unresolvedConflicts} unresolved)`}
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
            Cancel Run
          </Button>
        </div>
      )}

      {isTerminal && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-center text-sm text-muted-foreground">
          This import run is <strong>{run?.status}</strong>. Staged data is preserved for audit.
        </div>
      )}
    </div>
  );
}
