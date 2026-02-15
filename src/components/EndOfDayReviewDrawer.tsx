import { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle2, Clock, Flame, Phone, ClipboardList, ExternalLink, Loader2, Play, SkipForward, AlarmClock, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { useSweepQueue, buildSmartFollowUp, getSnoozeOptions, type SweepItem } from '@/hooks/useSweepQueue';
import type { Task, Lead, Deal } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';

function formatFreshness(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return 'Updated just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `Updated ${seconds}s ago`;
  return `Updated ${minutes}m ago`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  overdueTasks: Task[];
  untouchedHotLeads: Lead[];
  computedAt: Date;
  deals: Deal[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  onLogTouch: (entityType: 'lead' | 'deal', entityId: string, entityTitle: string) => void;
  onCreateTask: (prefillTitle?: string, relatedLeadId?: string, relatedDealId?: string) => void;
  onNavigateToTasks: () => void;
}

export function EndOfDayReviewDrawer({
  open, onClose, overdueTasks, untouchedHotLeads, computedAt, deals, moneyResults, opportunityResults,
  onLogTouch, onCreateTask, onNavigateToTasks,
}: Props) {
  const { completeTask, addTask, refreshData } = useData();
  const { user } = useAuth();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [inlineMsg, setInlineMsg] = useState<string | null>(null);

  const sweep = useSweepQueue(overdueTasks, untouchedHotLeads, deals, moneyResults, opportunityResults);
  const { sweepMode, activeQueue, currentItem, sweepDone, totalItems, sweepStats, resumeNextTime, setResumeNextTime } = sweep;

  const isBusy = currentItem ? busyIds.has(currentItem.id) : false;

  // Reset when drawer closes (unless resuming)
  useEffect(() => {
    if (!open && !resumeNextTime) {
      sweep.resetSweep();
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

  const snoozeOptions = useMemo(() => getSnoozeOptions(), []);

  // ── Sweep actions ──
  const handleSweepComplete = async () => {
    if (!currentItem || currentItem.kind !== 'task' || isBusy) return;
    markBusy(currentItem.id);
    try {
      await completeTask(currentItem.id);
      sweep.recordStat('completed');
      sweep.advanceSweep(currentItem.id);
      setInlineMsg('Task completed');
    } finally {
      clearBusy(currentItem.id);
    }
  };

  const handleSweepTouch = async () => {
    if (!currentItem || currentItem.kind !== 'lead' || isBusy) return;
    onLogTouch('lead', currentItem.lead.id, currentItem.lead.name);
    sweep.recordStat('touches');
    sweep.advanceSweep(currentItem.id);
    setInlineMsg('Touch flow opened');
  };

  const handleSweepFollowUp = async () => {
    if (!currentItem || isBusy) return;
    markBusy(currentItem.id);
    try {
      const followUp = buildSmartFollowUp(currentItem, deals);
      await addTask({
        title: followUp.title,
        type: followUp.type as any,
        dueAt: followUp.dueAt,
        relatedLeadId: followUp.relatedLeadId,
        relatedDealId: followUp.relatedDealId,
        assignedToUserId: user?.id || '',
      });
      sweep.recordStat('followUps');
      sweep.advanceSweep(currentItem.id);
      setInlineMsg('Follow-up created');
    } finally {
      clearBusy(currentItem.id);
    }
  };

  const handleSweepSnooze = (until: Date) => {
    if (!currentItem || isBusy) return;
    sweep.snoozeItem(currentItem.id, until);
    setInlineMsg('Snoozed');
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
              {!sweepMode && sweep.sweepQueue.length > 0 && (
                <Button size="sm" className="text-xs gap-1.5" onClick={sweep.startSweep}>
                  <Play className="h-3 w-3" /> Start Sweep
                </Button>
              )}
              {sweepMode && !sweepDone && (
                <Button size="sm" variant="outline" className="text-xs" onClick={sweep.exitSweep}>
                  Exit Sweep
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* ── Sweep Mode ── */}
          {sweepMode ? (
            <div className="space-y-4">
              {sweepDone ? (
                <SweepCompletionState stats={sweepStats} onClose={onClose} />
              ) : currentItem && (
                <SweepCard
                  item={currentItem}
                  position={totalItems - activeQueue.length + 1}
                  total={totalItems}
                  isBusy={isBusy}
                  snoozeOptions={snoozeOptions}
                  onComplete={handleSweepComplete}
                  onLogTouch={handleSweepTouch}
                  onFollowUp={handleSweepFollowUp}
                  onSkip={() => sweep.advanceSweep(currentItem.id)}
                  onSnooze={handleSweepSnooze}
                />
              )}

              {/* Resume toggle */}
              {!sweepDone && (
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="resume-sweep"
                    checked={resumeNextTime}
                    onCheckedChange={setResumeNextTime}
                  />
                  <Label htmlFor="resume-sweep" className="text-xs text-muted-foreground cursor-pointer">
                    Resume Sweep next time
                  </Label>
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

// ── Sweep Card sub-component ─────────────────────────────────────────

function SweepCard({
  item, position, total, isBusy, snoozeOptions,
  onComplete, onLogTouch, onFollowUp, onSkip, onSnooze,
}: {
  item: SweepItem;
  position: number;
  total: number;
  isBusy: boolean;
  snoozeOptions: { label: string; until: Date }[];
  onComplete: () => void;
  onLogTouch: () => void;
  onFollowUp: () => void;
  onSkip: () => void;
  onSnooze: (until: Date) => void;
}) {
  const [showSnooze, setShowSnooze] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {item.kind === 'task' ? 'Task' : 'Lead'}
        </Badge>
        {item.kind === 'task' && item.commissionAtRisk && item.commissionAtRisk > 0 && (
          <Badge variant="warning" className="text-[10px] gap-1">
            <DollarSign className="h-2.5 w-2.5" />
            {Math.round(item.commissionAtRisk).toLocaleString()} at risk
          </Badge>
        )}
        {item.kind === 'lead' && item.opportunityValue && item.opportunityValue > 0 && (
          <Badge variant="opportunity" className="text-[10px] gap-1">
            <DollarSign className="h-2.5 w-2.5" />
            {Math.round(item.opportunityValue).toLocaleString()} opportunity
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {position} of {total}
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {item.kind === 'task' && (
          <Button size="sm" className="text-xs gap-1.5" disabled={isBusy} onClick={onComplete}>
            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Complete Task
          </Button>
        )}
        {item.kind === 'lead' && (
          <Button size="sm" className="text-xs gap-1.5" disabled={isBusy} onClick={onLogTouch}>
            <Phone className="h-3 w-3" /> Log Touch
          </Button>
        )}
        <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={isBusy} onClick={onFollowUp}>
          {isBusy && item.kind !== 'task' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
          Follow-up Task
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs gap-1 text-muted-foreground"
          disabled={isBusy}
          onClick={() => setShowSnooze(!showSnooze)}
        >
          <AlarmClock className="h-3 w-3" /> Snooze
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs gap-1 text-muted-foreground ml-auto"
          disabled={isBusy}
          onClick={onSkip}
        >
          <SkipForward className="h-3 w-3" /> Skip
        </Button>
      </div>

      {/* Snooze options */}
      {showSnooze && (
        <div className="flex gap-2 pt-1 animate-fade-in">
          {snoozeOptions.map(opt => (
            <Button
              key={opt.label}
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => { onSnooze(opt.until); setShowSnooze(false); }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Completion state sub-component ───────────────────────────────────

function SweepCompletionState({ stats, onClose }: { stats: { completed: number; touches: number; followUps: number }; onClose: () => void }) {
  return (
    <div className="py-8 text-center space-y-3">
      <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm font-medium">All clear for today.</p>
      <div className="flex justify-center gap-4 text-xs text-muted-foreground">
        {stats.completed > 0 && <span>{stats.completed} task{stats.completed !== 1 ? 's' : ''} completed</span>}
        {stats.touches > 0 && <span>{stats.touches} touch{stats.touches !== 1 ? 'es' : ''} logged</span>}
        {stats.followUps > 0 && <span>{stats.followUps} follow-up{stats.followUps !== 1 ? 's' : ''} created</span>}
        {stats.completed === 0 && stats.touches === 0 && stats.followUps === 0 && (
          <span>No items needed attention</span>
        )}
      </div>
      <Button size="sm" variant="outline" className="text-xs mt-2" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
