import { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle2, Clock, Flame, Phone, ClipboardList, ExternalLink, Loader2, Play, ArrowRight, SkipForward, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import type { Task, Lead } from '@/types';

function formatFreshness(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return 'Updated just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `Updated ${seconds}s ago`;
  return `Updated ${minutes}m ago`;
}

type SweepItem =
  | { kind: 'task'; id: string; title: string; reason: string; task: Task }
  | { kind: 'lead'; id: string; title: string; reason: string; lead: Lead };

interface Props {
  open: boolean;
  onClose: () => void;
  overdueTasks: Task[];
  untouchedHotLeads: Lead[];
  computedAt: Date;
  onLogTouch: (entityType: 'lead' | 'deal', entityId: string, entityTitle: string) => void;
  onCreateTask: (prefillTitle?: string, relatedLeadId?: string, relatedDealId?: string) => void;
  onNavigateToTasks: () => void;
}

export function EndOfDayReviewDrawer({ open, onClose, overdueTasks, untouchedHotLeads, computedAt, onLogTouch, onCreateTask, onNavigateToTasks }: Props) {
  const { completeTask, addTask, refreshData } = useData();
  const { user } = useAuth();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [inlineMsg, setInlineMsg] = useState<string | null>(null);
  const [sweepMode, setSweepMode] = useState(false);
  const [sweepIndex, setSweepIndex] = useState(0);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [sweepStats, setSweepStats] = useState({ completed: 0, touches: 0, followUps: 0 });

  // Reset sweep state when drawer closes
  useEffect(() => {
    if (!open) {
      setSweepMode(false);
      setSweepIndex(0);
      setProcessedIds(new Set());
      setSweepStats({ completed: 0, touches: 0, followUps: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!inlineMsg) return;
    const t = setTimeout(() => setInlineMsg(null), 2500);
    return () => clearTimeout(t);
  }, [inlineMsg]);

  const markBusy = useCallback((id: string) => setBusyIds(p => new Set(p).add(id)), []);
  const clearBusy = useCallback((id: string) => setBusyIds(p => { const n = new Set(p); n.delete(id); return n; }), []);

  const sortedOverdue = useMemo(() => {
    return [...overdueTasks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).slice(0, 8);
  }, [overdueTasks]);

  const sortedLeads = useMemo(() => [...untouchedHotLeads].slice(0, 8), [untouchedHotLeads]);

  // ── Sweep queue ──
  const sweepQueue = useMemo((): SweepItem[] => {
    const taskItems: SweepItem[] = [...overdueTasks]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .map(t => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        reason: `Overdue · ${formatDistanceToNow(new Date(t.dueAt), { addSuffix: true })}`,
        task: t,
      }));

    const leadItems: SweepItem[] = [...untouchedHotLeads]
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .map(l => ({
        kind: 'lead' as const,
        id: l.id,
        title: l.name,
        reason: l.leadTemperature === 'hot' ? 'Hot lead · Untouched today' : 'High engagement · Untouched today',
        lead: l,
      }));

    return [...taskItems, ...leadItems];
  }, [overdueTasks, untouchedHotLeads]);

  // Active queue filters out processed items
  const activeQueue = useMemo(() => sweepQueue.filter(i => !processedIds.has(i.id)), [sweepQueue, processedIds]);
  const currentItem = activeQueue.length > 0 ? activeQueue[0] : null;
  const isBusy = currentItem ? busyIds.has(currentItem.id) : false;
  const sweepDone = sweepMode && !currentItem;

  const advanceSweep = useCallback((itemId: string) => {
    setProcessedIds(p => new Set(p).add(itemId));
  }, []);

  // ── Sweep actions ──
  const handleSweepComplete = async () => {
    if (!currentItem || currentItem.kind !== 'task' || isBusy) return;
    markBusy(currentItem.id);
    try {
      await completeTask(currentItem.id);
      setSweepStats(p => ({ ...p, completed: p.completed + 1 }));
      advanceSweep(currentItem.id);
      setInlineMsg('Task completed');
    } finally {
      clearBusy(currentItem.id);
    }
  };

  const handleSweepTouch = async () => {
    if (!currentItem || currentItem.kind !== 'lead' || isBusy) return;
    // Open LogTouchModal via parent callback — mark as processed when modal opens
    onLogTouch('lead', currentItem.lead.id, currentItem.lead.name);
    setSweepStats(p => ({ ...p, touches: p.touches + 1 }));
    advanceSweep(currentItem.id);
    setInlineMsg('Touch flow opened');
  };

  const handleSweepFollowUp = async () => {
    if (!currentItem || isBusy) return;
    markBusy(currentItem.id);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const title = currentItem.kind === 'task'
        ? `Follow up: ${currentItem.task.title}`
        : `Follow up ${currentItem.lead.name}`;
      await addTask({
        title,
        type: 'follow_up',
        dueAt: tomorrow.toISOString(),
        relatedLeadId: currentItem.kind === 'lead' ? currentItem.lead.id : currentItem.task.relatedLeadId,
        relatedDealId: currentItem.kind === 'task' ? currentItem.task.relatedDealId : undefined,
        assignedToUserId: user?.id || '',
      });
      setSweepStats(p => ({ ...p, followUps: p.followUps + 1 }));
      advanceSweep(currentItem.id);
      setInlineMsg('Follow-up created');
    } finally {
      clearBusy(currentItem.id);
    }
  };

  // ── List mode handlers ──
  const handleMarkDone = async (taskId: string) => {
    if (busyIds.has(taskId)) return;
    markBusy(taskId);
    try {
      await completeTask(taskId);
      setInlineMsg('Task completed');
    } finally {
      clearBusy(taskId);
    }
  };

  const handleCreateFollowUp = async (task: Task) => {
    const key = `followup-${task.id}`;
    if (busyIds.has(key)) return;
    markBusy(key);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await addTask({
        title: `Follow up: ${task.title}`,
        type: 'follow_up',
        dueAt: tomorrow.toISOString(),
        relatedLeadId: task.relatedLeadId,
        relatedDealId: task.relatedDealId,
        assignedToUserId: user?.id || '',
      });
      setInlineMsg('Follow-up task created');
    } finally {
      clearBusy(key);
    }
  };

  const typeLabels: Record<string, string> = {
    call: 'Call', text: 'Text', email: 'Email', showing: 'Showing',
    follow_up: 'Follow Up', closing: 'Closing', open_house: 'Open House', thank_you: 'Thank You',
  };

  const totalItems = sweepQueue.length;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <PanelErrorBoundary>
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-base">
                  {sweepMode ? 'End-of-Day Sweep' : 'End-of-Day Review'}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {sweepMode
                    ? `${activeQueue.length} item${activeQueue.length !== 1 ? 's' : ''} remaining`
                    : <>Items to consider before logging off.<span className="ml-2 text-muted-foreground/70">· {formatFreshness(computedAt)}</span></>
                  }
                </SheetDescription>
              </div>
              {!sweepMode && sweepQueue.length > 0 && (
                <Button size="sm" className="text-xs gap-1.5" onClick={() => setSweepMode(true)}>
                  <Play className="h-3 w-3" /> Start Sweep
                </Button>
              )}
              {sweepMode && !sweepDone && (
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setSweepMode(false)}>
                  Exit Sweep
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* ── Sweep Mode ── */}
          {sweepMode ? (
            <div className="space-y-4">
              {sweepDone ? (
                /* Completion state */
                <div className="py-8 text-center space-y-3">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">All clear for today.</p>
                  <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                    {sweepStats.completed > 0 && <span>{sweepStats.completed} task{sweepStats.completed !== 1 ? 's' : ''} completed</span>}
                    {sweepStats.touches > 0 && <span>{sweepStats.touches} touch{sweepStats.touches !== 1 ? 'es' : ''} logged</span>}
                    {sweepStats.followUps > 0 && <span>{sweepStats.followUps} follow-up{sweepStats.followUps !== 1 ? 's' : ''} created</span>}
                    {sweepStats.completed === 0 && sweepStats.touches === 0 && sweepStats.followUps === 0 && (
                      <span>No items needed attention</span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="text-xs mt-2" onClick={onClose}>
                    Close
                  </Button>
                </div>
              ) : currentItem && (
                /* Up Next card */
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {currentItem.kind === 'task' ? 'Task' : 'Lead'}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {totalItems - activeQueue.length + 1} of {totalItems}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold">{currentItem.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{currentItem.reason}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {currentItem.kind === 'task' && (
                      <Button size="sm" className="text-xs gap-1.5" disabled={isBusy} onClick={handleSweepComplete}>
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Complete Task
                      </Button>
                    )}
                    {currentItem.kind === 'lead' && (
                      <Button size="sm" className="text-xs gap-1.5" disabled={isBusy} onClick={handleSweepTouch}>
                        <Phone className="h-3 w-3" /> Log Touch
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={isBusy} onClick={handleSweepFollowUp}>
                      {isBusy && currentItem.kind !== 'task' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
                      Follow-up Task
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs gap-1 text-muted-foreground ml-auto"
                      disabled={isBusy}
                      onClick={() => advanceSweep(currentItem.id)}
                    >
                      <SkipForward className="h-3 w-3" /> Skip
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline confirmation */}
              {inlineMsg && (
                <div className="py-2 px-3 rounded-md bg-muted text-xs text-muted-foreground text-center animate-fade-in">
                  {inlineMsg}
                </div>
              )}
            </div>
          ) : (
            /* ── Standard list mode ── */
            <>
              <div className="space-y-6">
                {/* Overdue Tasks */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Overdue Tasks</h3>
                    {overdueTasks.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-auto">{overdueTasks.length}</Badge>
                    )}
                  </div>
                  {sortedOverdue.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">No overdue tasks.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {sortedOverdue.map(task => {
                        const taskBusy = busyIds.has(task.id) || busyIds.has(`followup-${task.id}`);
                        return (
                          <div key={task.id} className="flex items-start gap-3 p-2.5 rounded-md border border-border bg-background">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{task.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">{typeLabels[task.type] || task.type}</Badge>
                                <span className="text-xs text-urgent">
                                  {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" disabled={taskBusy} onClick={() => handleMarkDone(task.id)}>
                                {busyIds.has(task.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Done</>}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" disabled={taskBusy} onClick={() => handleCreateFollowUp(task)}>
                                {busyIds.has(`followup-${task.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ClipboardList className="h-3 w-3 mr-1" /> Follow up</>}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Untouched Hot Leads */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">High-Opportunity Leads Untouched Today</h3>
                    {untouchedHotLeads.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-auto">{untouchedHotLeads.length}</Badge>
                    )}
                  </div>
                  {sortedLeads.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">All hot leads have been touched today.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {sortedLeads.map(lead => (
                        <div key={lead.id} className="flex items-start gap-3 p-2.5 rounded-md border border-border bg-background">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{lead.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{lead.source}</span>
                              {lead.leadTemperature && (
                                <Badge variant={lead.leadTemperature === 'hot' ? 'urgent' : 'warning'} className="text-[10px]">
                                  {lead.leadTemperature}
                                </Badge>
                              )}
                              {lead.lastTouchedAt && (
                                <span className="text-xs text-muted-foreground">
                                  Last: {formatDistanceToNow(new Date(lead.lastTouchedAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => onLogTouch('lead', lead.id, lead.name)}>
                              <Phone className="h-3 w-3 mr-1" /> Touch
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => onCreateTask(`Follow up ${lead.name}`, lead.id)}>
                              <ClipboardList className="h-3 w-3 mr-1" /> Task
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Inline confirmation */}
              {inlineMsg && (
                <div className="mt-3 py-2 px-3 rounded-md bg-muted text-xs text-muted-foreground text-center animate-fade-in">
                  {inlineMsg}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 pt-6 mt-4 border-t border-border">
                <Button size="sm" className="text-xs" onClick={() => onCreateTask()}>
                  <ClipboardList className="h-3 w-3 mr-1" /> Create Task
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={onClose}>
                  Close
                </Button>
                <button
                  onClick={() => { onClose(); onNavigateToTasks(); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Open full Tasks view <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
