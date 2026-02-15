import { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle2, Clock, Flame, Phone, ClipboardList, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import type { Task, Lead } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  overdueTasks: Task[];
  untouchedHotLeads: Lead[];
  onLogTouch: (entityType: 'lead' | 'deal', entityId: string, entityTitle: string) => void;
  onCreateTask: (prefillTitle?: string, relatedLeadId?: string, relatedDealId?: string) => void;
  onNavigateToTasks: () => void;
}

export function EndOfDayReviewDrawer({ open, onClose, overdueTasks, untouchedHotLeads, onLogTouch, onCreateTask, onNavigateToTasks }: Props) {
  const { completeTask, addTask } = useData();
  const { user } = useAuth();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [inlineMsg, setInlineMsg] = useState<string | null>(null);

  // Auto-dismiss inline message
  useEffect(() => {
    if (!inlineMsg) return;
    const t = setTimeout(() => setInlineMsg(null), 2500);
    return () => clearTimeout(t);
  }, [inlineMsg]);

  const markBusy = useCallback((id: string) => setBusyIds(p => new Set(p).add(id)), []);
  const clearBusy = useCallback((id: string) => setBusyIds(p => { const n = new Set(p); n.delete(id); return n; }), []);

  const sortedOverdue = useMemo(() => {
    return [...overdueTasks]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 8);
  }, [overdueTasks]);

  const sortedLeads = useMemo(() => [...untouchedHotLeads].slice(0, 8), [untouchedHotLeads]);

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
            <SheetTitle className="text-base">End-of-Day Review</SheetTitle>
            <SheetDescription className="text-xs">Items to consider before logging off.</SheetDescription>
          </SheetHeader>

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
                    const isBusy = busyIds.has(task.id) || busyIds.has(`followup-${task.id}`);
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
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" disabled={isBusy} onClick={() => handleMarkDone(task.id)}>
                            {busyIds.has(task.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Done</>}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" disabled={isBusy} onClick={() => handleCreateFollowUp(task)}>
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
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
