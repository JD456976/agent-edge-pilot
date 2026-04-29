/**
 * ActionComposerDrawer — Full-screen action workspace with
 * left context panel + right execution tabs.
 * Enhanced for the "Default Interface" layer.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Phone, MessageSquare, Mail, ListTodo, StickyNote,
  Copy, Check, Shield, ChevronDown, ChevronUp,
  Clock, AlertTriangle, TrendingUp, Target, X,
  Send, Loader2, ArrowUpRight, ArrowDownLeft, Info, Sparkles,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFubSend } from '@/hooks/useFubSend';
import { toast } from '@/hooks/use-toast';
import { callClaude } from '@/lib/aiError';
import { ActivityTrail } from '@/components/ActivityTrail';
import { LocalIntelBriefPanel } from '@/components/LocalIntelBriefPanel';
import { ClientPreferencesPanel } from '@/components/ClientPreferencesPanel';
import { ClientFitPanel } from '@/components/ClientFitPanel';
import { ClientCommitmentPanel } from '@/components/ClientCommitmentPanel';
import { LeadScorePopover } from '@/components/LeadScorePopover';
import type { FubPersonProfile } from '@/lib/intelAnalyzer';
import type { Deal, Lead, Task, TaskType } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import {
  buildExecutionContext,
  composeCommunication,
  generateCallBrief,
  anticipateObjections,
  generateFollowUp,
  type ExecutionContext,
  type CommunicationDraft,
  type CallBrief,
  type ObjectionEntry,
  type ConfidenceLevel,
} from '@/lib/executionEngine';

type WorkspaceTab = 'call' | 'text' | 'email' | 'task' | 'notes' | 'intel' | 'prefs';

interface Props {
  open: boolean;
  onClose: () => void;
  entity: Deal | Lead | null;
  entityType: 'deal' | 'lead';
  moneyResult?: MoneyModelResult | null;
  oppResult?: OpportunityHeatResult | null;
  tasks?: Task[];
  onCreateTask?: (title: string, type: TaskType, dueAt: string, entityId: string, entityType: 'deal' | 'lead') => void;
  onLogTouch?: (entityType: 'deal' | 'lead', entityId: string, entityTitle: string, touchType: string, note?: string) => void;
  onCompleteTask?: (taskId: string) => void;
  // Legacy compat
  onCreateFollowUp?: (title: string, dueAt: string, entityId: string, entityType: 'deal' | 'lead') => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

function daysSince(dateStr: string | undefined | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-opportunity/10 text-opportunity border-opportunity/20',
  MEDIUM: 'bg-warning/10 text-warning border-warning/20',
  LOW: 'bg-muted text-muted-foreground border-border',
};

const CALL_OUTCOMES = [
  { id: 'spoke_briefly', label: '✅ Spoke Briefly', touchType: 'call', note: 'Spoke briefly' },
  { id: 'scheduled_meeting', label: '📅 Scheduled', touchType: 'call', note: 'Scheduled a meeting' },
  { id: 'no_answer', label: '📵 No Answer', touchType: 'call', note: 'Called — no answer' },
  { id: 'removed', label: '🔴 Removed', touchType: 'call', note: 'Lead removed / not interested' },
] as const;

function logActivityToLocalStorage(leadId: string, outcome: string) {
  try {
    const key = 'dealPilot_activities';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ leadId, type: 'call', outcome, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* ignore */ }
}

type EmailTone = 'direct' | 'friendly' | 'professional';

function adjustEmailTone(body: string, tone: EmailTone): string {
  if (tone === 'direct') return body.replace(/I hope you're doing well\.\s*/g, '').replace(/I wanted to/g, 'I need to').replace(/Best regards/g, 'Thanks');
  if (tone === 'friendly') return body.replace(/Best regards/g, 'Looking forward to hearing from you!\n\nWarmly');
  return body;
}

function generateSmsVariants(name: string, context: string): { label: string; text: string }[] {
  return [
    { label: 'Short', text: `Hi ${name}, checking in — do you have a moment to connect today?` },
    { label: 'Medium', text: `Hi ${name}, I wanted to follow up on our conversation. ${context ? context + ' ' : ''}Are you available for a quick chat?` },
    { label: 'Friendly', text: `Hey ${name}! Hope you're doing well. I've been thinking about your situation and had a few ideas. Would love to chat when you have a moment.` },
  ];
}

function getSmartDueDate(entity: Deal | Lead, entityType: 'deal' | 'lead'): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  if (entityType === 'deal') {
    const deal = entity as Deal;
    if (deal.riskLevel === 'red') return new Date().toISOString();
    if (deal.riskLevel === 'yellow') return tomorrow.toISOString();
  } else {
    const lead = entity as Lead;
    if (lead.leadTemperature === 'hot') return new Date().toISOString();
    if (lead.leadTemperature === 'warm') return tomorrow.toISOString();
  }
  const in2days = new Date();
  in2days.setDate(in2days.getDate() + 2);
  in2days.setHours(9, 0, 0, 0);
  return in2days.toISOString();
}

// ── Score helpers (mirrors Work.tsx) ─────────────────────────────────

function getLastContactDate(lead: Lead): Date | null {
  const dbDate = lead.lastTouchedAt || lead.lastContactAt;
  let best = dbDate ? new Date(dbDate) : null;
  try {
    const log = JSON.parse(localStorage.getItem('dealPilot_activityLog') || '[]') as Array<{leadId?: string; leadName?: string; timestamp?: number}>;
    const entries = log.filter(e => e.leadId === lead.id || e.leadName === lead.name);
    if (entries.length > 0) {
      const latest = entries.reduce((a, b) => (a.timestamp || 0) > (b.timestamp || 0) ? a : b);
      const localDate = new Date(latest.timestamp || 0);
      if (!best || localDate > best) best = localDate;
    }
  } catch { /* ignore */ }
  return best;
}

function getLeadHeatScore(lead: Lead): number {
  let score = lead.engagementScore || 0;
  if (lead.leadTemperature === 'hot') score = Math.max(score, 75);
  else if (lead.leadTemperature === 'warm') score = Math.max(score, 50);
  const src = (lead.source || '').toLowerCase();
  if (src.includes('zillow preferred')) score = Math.max(score, 35);
  else if (src.includes('zillow')) score = Math.max(score, 25);
  else if (src.includes('referral') || src.includes('sphere')) score = Math.max(score, 30);
  else if (src.includes('realtor') || src.includes('redfin')) score = Math.max(score, 22);
  else if (lead.source) score = Math.max(score, 18);
  const lastContact = getLastContactDate(lead);
  if (lastContact) {
    const daysSince = (Date.now() - lastContact.getTime()) / 86400000;
    if (daysSince < 1) score += 20;
    else if (daysSince < 3) score += 12;
    else if (daysSince < 7) score += 6;
    else if (daysSince < 14) score += 2;
  }
  if (lead.statusTags?.some(t => ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase()))) score += 20;
  return Math.min(score, 100);
}

// ── Post-Action Bar ──────────────────────────────────────────────────

function PostActionBar({ onLogTouch, onScheduleFollowUp, onDone }: {
  onLogTouch: () => void;
  onScheduleFollowUp: () => void;
  onDone: () => void;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 space-y-3">
      <p className="text-sm font-medium">Action completed — what's next?</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="text-xs" onClick={onLogTouch}>
          <Phone className="h-3 w-3 mr-1" /> Log Touch
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={onScheduleFollowUp}>
          <Clock className="h-3 w-3 mr-1" /> Schedule Follow-Up
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ── Context Panel ────────────────────────────────────────────────────

function ContextPanel({ entity, entityType, moneyResult, oppResult, tasks: entityTasks, recentFubActivities }: {
  entity: Deal | Lead;
  entityType: 'deal' | 'lead';
  moneyResult?: MoneyModelResult | null;
  oppResult?: OpportunityHeatResult | null;
  tasks?: Task[];
  recentFubActivities?: Array<{ activity_type: string; direction?: string; body_preview?: string; subject?: string; occurred_at: string; duration_seconds?: number }>;
}) {
  const relatedTasks = useMemo(() => {
    if (!entityTasks) return [];
    return entityTasks.filter(t => {
      if (entityType === 'deal') return t.relatedDealId === entity.id;
      return t.relatedLeadId === entity.id;
    }).filter(t => !t.completedAt).slice(0, 5);
  }, [entityTasks, entity.id, entityType]);

  const lead = entityType === 'lead' ? entity as Lead : null;
  const activities = recentFubActivities || [];

  // Derive engagement from FUB activity if local score is 0
  const effectiveEngagement = useMemo(() => {
    if (!lead) return 0;
    if (lead.engagementScore > 0) return lead.engagementScore;
    if (activities.length === 0) return 0;
    return Math.min(100, activities.length * 4);
  }, [lead?.engagementScore, activities.length]);

  const lastContactDays = useMemo(() => {
    if (!lead) return 999;
    const candidates = [lead.lastContactAt, (lead as any).lastTouchedAt].filter(Boolean).map(d => new Date(d!).getTime());
    if (activities.length > 0) candidates.push(new Date(activities[0].occurred_at).getTime());
    if (candidates.length === 0) return 999;
    return Math.floor((Date.now() - Math.max(...candidates)) / (1000 * 60 * 60 * 24));
  }, [lead?.lastContactAt, activities]);

  if (entityType === 'deal') {
    const deal = entity as Deal;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Price</p>
            <p className="text-sm font-semibold">{formatCurrency(deal.price)}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
            <p className="text-sm font-semibold">{formatCurrency(deal.commission)}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stage</p>
            <p className="text-xs font-medium capitalize">{deal.stage.replace('_', ' ')}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Close</p>
            <p className="text-xs font-medium">{new Date(deal.closeDate).toLocaleDateString()}</p>
          </div>
        </div>

        {moneyResult && moneyResult.personalCommissionAtRisk > 0 && (
          <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className="h-3 w-3 text-warning" />
              <p className="text-[10px] font-medium text-warning">At Risk</p>
            </div>
            <p className="text-sm font-semibold">{formatCurrency(moneyResult.personalCommissionAtRisk)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{moneyResult.reasonPrimary}</p>
          </div>
        )}

        {deal.milestoneStatus && (
          <div className="space-y-1">
            {(['inspection', 'financing', 'appraisal'] as const).map(key => {
              const val = deal.milestoneStatus?.[key] || 'unknown';
              return (
                <div key={key} className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-muted-foreground">{key}</span>
                  <span className={val === 'unknown' ? 'text-warning' : 'text-opportunity'}>{val}</span>
                </div>
              );
            })}
          </div>
        )}

        {deal.riskFlags && deal.riskFlags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {deal.riskFlags.map((f, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-urgent/10 text-urgent">{f}</span>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Last contact: {deal.lastTouchedAt ? `${daysSince(deal.lastTouchedAt)}d ago` : 'Unknown'}
        </p>

        {relatedTasks.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Open Tasks</p>
            {relatedTasks.map(task => (
              <div key={task.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ListTodo className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{task.title}</span>
              </div>
            ))}
          </div>
        )}

        <ActivityTrail entityId={entity.id} entityType="deal" />
      </div>
    );
  }

  const tempColor = lead!.leadTemperature === 'hot' ? 'bg-urgent/15 text-urgent border-urgent/30' :
    lead!.leadTemperature === 'warm' ? 'bg-warning/15 text-warning border-warning/30' :
    'bg-muted text-muted-foreground border-border';

  const contactColor = lastContactDays > 14 ? 'text-urgent' : lastContactDays > 7 ? 'text-warning' : 'text-muted-foreground';

  return (
    <div className="space-y-3">
      {/* Compact Intel Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <LeadScorePopover lead={lead!} score={getLeadHeatScore(lead!)}>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize', tempColor)}>
            {lead!.leadTemperature || 'cold'}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{effectiveEngagement}</span>
            <span className="w-10 h-1.5 rounded-full bg-muted overflow-hidden inline-block align-middle">
              <span className="block h-full rounded-full bg-primary/60 transition-all" style={{ width: `${Math.min(100, effectiveEngagement)}%` }} />
            </span>
          </span>
        </LeadScorePopover>
        {lead!.source && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {lead!.source}
          </span>
        )}
        <span className={cn('inline-flex items-center gap-0.5 text-[10px] ml-auto', contactColor)}>
          <Clock className="h-2.5 w-2.5" />
          {lastContactDays === 0 ? 'Today' : `${lastContactDays}d ago`}
        </span>
      </div>

      {oppResult && oppResult.opportunityValue > 0 && (
        <div className="rounded-md border border-opportunity/20 bg-opportunity/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="h-3 w-3 text-opportunity" />
            <p className="text-[10px] font-medium text-opportunity">Opportunity</p>
          </div>
          <p className="text-sm font-semibold">{formatCurrency(oppResult.opportunityValue)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{oppResult.reasonPrimary}</p>
        </div>
      )}

      {lead!.notes && (
        <p className="text-[10px] text-muted-foreground line-clamp-3">{lead!.notes}</p>
      )}

      {relatedTasks.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Open Tasks</p>
          {relatedTasks.map(task => (
            <div key={task.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ListTodo className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      <ActivityTrail entityId={entity.id} entityType="lead" />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function ActionComposerDrawer({
  open, onClose, entity, entityType,
  moneyResult, oppResult, tasks,
  onCreateTask, onLogTouch, onCompleteTask, onCreateFollowUp,
}: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('call');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showObjections, setShowObjections] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [callOutcomeLogged, setCallOutcomeLogged] = useState(false);
  const [showPostAction, setShowPostAction] = useState(false);
  const [selectedSmsIndex, setSelectedSmsIndex] = useState(0);
  const [emailTone, setEmailTone] = useState<EmailTone>('professional');
  const [editedEmail, setEditedEmail] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('follow_up');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savedNotes, setSavedNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);

  // FUB send state
  const [fubPersonId, setFubPersonId] = useState<number | null>(null);
  const [quickSendMode, setQuickSendMode] = useState(false);
  const [textSent, setTextSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [recentFubActivities, setRecentFubActivities] = useState<Array<{ activity_type: string; direction?: string; body_preview?: string; subject?: string; occurred_at: string; duration_seconds?: number }>>([]);
  const [fubProfile, setFubProfile] = useState<FubPersonProfile | null>(null);
  const [aiTextDraft, setAiTextDraft] = useState<string | null>(null);
  const [aiTextLoading, setAiTextLoading] = useState(false);

  // Derive FUB person ID
  useEffect(() => {
    if (!entity) { setFubPersonId(null); return; }
    const importedFrom = (entity as any)?.importedFrom || (entity as any)?.imported_from;
    if (importedFrom?.startsWith('fub:')) {
      setFubPersonId(parseInt(importedFrom.replace('fub:', '')));
    } else {
      setFubPersonId(null);
    }
  }, [entity]);

  // Load FUB activities
  useEffect(() => {
    if (!entity || !open || !fubPersonId) {
      setRecentFubActivities([]);
      setFubProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // FUB activity edge function paused — skipping enrichment
        if (!cancelled && result) {
          setRecentFubActivities(result.activities || []);
          if (result.personProfile) setFubProfile(result.personProfile as FubPersonProfile);
        }
    } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [entity, open, fubPersonId]);


  const loadNotes = useCallback(async (eType: string, eId: string) => {
    const { data } = await supabase
      .from('activity_events')
      .select('id, note, created_at')
      .eq('entity_type', eType)
      .eq('entity_id', eId)
      .eq('touch_type', 'note')
      .not('note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);
    setSavedNotes((data || []) as any);
  }, []);

  useEffect(() => {
    if (entity && entityType && open) {
      const eId = entityType === 'deal' ? (entity as Deal).id : (entity as Lead).id;
      loadNotes(entityType, eId);
    }
  }, [entity, entityType, open, loadNotes]);

  const context = useMemo((): ExecutionContext | null => {
    if (!entity) return null;
    return buildExecutionContext(entity, entityType, moneyResult, oppResult, tasks);
  }, [entity, entityType, moneyResult, oppResult, tasks]);

  // FUB send hook (after context is defined)
  const fubSendOptions = useMemo(() => {
    if (!fubPersonId || !context) return null;
    return { fubPersonId, entityId: context.entityId, entityType: context.entityType };
  }, [fubPersonId, context]);
  const { sendText, sendEmail, sending } = useFubSend(fubSendOptions);

  const draft = useMemo((): CommunicationDraft | null => {
    if (!context) return null;
    const contextDetails = context.riskSignals.length > 0
      ? `Current considerations: ${context.riskSignals.join(', ')}`
      : context.stage ? `Current stage: ${context.stage}` : '';
    return composeCommunication(context.intent, context.entityName, contextDetails);
  }, [context]);

  const callBrief = useMemo((): CallBrief | null => {
    if (!entity) return null;
    return generateCallBrief(entity, entityType, moneyResult, oppResult);
  }, [entity, entityType, moneyResult, oppResult]);

  const objections = useMemo((): ObjectionEntry[] => {
    if (!entity) return [];
    return anticipateObjections(entity, entityType);
  }, [entity, entityType]);

  const smsVariants = useMemo(() => {
    if (!context) return [];
    return generateSmsVariants(context.entityName, context.riskSignals[0] || '');
  }, [context]);

  const emailBody = useMemo(() => {
    if (!draft) return '';
    return adjustEmailTone(draft.email.body, emailTone);
  }, [draft, emailTone]);

  const smartDueDate = useMemo(() => {
    if (!entity) return new Date().toISOString();
    return getSmartDueDate(entity, entityType);
  }, [entity, entityType]);

  const handleClose = useCallback(() => {
    setCallOutcomeLogged(false);
    setShowPostAction(false);
    setSelectedSmsIndex(0);
    setEditedEmail(null);
    setEmailTone('professional');
    setTaskTitle('');
    setTaskType('follow_up');
    setTaskDueAt('');
    setTaskCreated(false);
    setNoteText('');
    setSavedNotes([]);
    setShowObjections(false);
    setCopiedField(null);
    setTextSent(false);
    setEmailSent(false);
    setQuickSendMode(false);
    onClose();
  }, [onClose]);

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const handleCallOutcome = useCallback((outcome: typeof CALL_OUTCOMES[number]) => {
    if (!context) return;
    onLogTouch?.(context.entityType, context.entityId, context.entityName, outcome.touchType, outcome.note);
    logActivityToLocalStorage(context.entityId, outcome.id);
    setCallOutcomeLogged(true);
    setShowPostAction(true);
    toast({ title: `Call logged — ${outcome.note}`, duration: 2000 });
  }, [context, onLogTouch]);

  const handleCreateTask = useCallback(() => {
    if (!context || !taskTitle.trim()) return;
    const dueAt = taskDueAt || smartDueDate;
    onCreateTask?.(taskTitle, taskType, dueAt, context.entityId, context.entityType);
    setTaskCreated(true);
  }, [context, taskTitle, taskType, taskDueAt, smartDueDate, onCreateTask]);

  const handleLogNote = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!context || !noteText.trim() || !user?.id) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      const orgId = profile?.organization_id || user.id;

      const { error } = await supabase.from('activity_events').insert({
        user_id: user.id,
        organization_id: orgId,
        entity_type: context.entityType,
        entity_id: context.entityId,
        touch_type: 'note',
        note: noteText.trim(),
      });
      if (error) throw error;

      await supabase.from(context.entityType === 'deal' ? 'deals' : 'leads')
        .update({ last_touched_at: new Date().toISOString() } as any)
        .eq('id', context.entityId);

      setNoteText('');
      toast({ description: 'Note saved' });
      // Reload notes
      loadNotes(context.entityType, context.entityId);
    } catch (err) {
      console.error('Note save error:', err);
      toast({ description: 'Could not save note', variant: 'destructive' });
    }
  }, [context, noteText, user?.id]);

  const handlePostActionFollowUp = useCallback(() => {
    if (!context || !entity) return;
    setShowPostAction(false);
    setActiveTab('task');
    const followUp = generateFollowUp(entity, entityType);
    if (followUp) {
      setTaskTitle(followUp.title);
      setTaskType(followUp.contactType);
      setTaskDueAt(followUp.dueAt);
    }
  }, [context, entity, entityType]);

  const handlePostActionLogTouch = useCallback(() => {
    if (!context) return;
    setShowPostAction(false);
    onLogTouch?.(context.entityType, context.entityId, context.entityName, 'follow_up', '');
  }, [context, onLogTouch]);

  const handleAiTextPersonalize = useCallback(async () => {
    if (!context || !entity) return;
    setAiTextLoading(true);
    setAiTextDraft(null);
    try {
      const lead = entity as any;
      const name = context.entityName;
      const daysSinceContact = lead.lastTouchedAt || lead.lastContactAt
        ? Math.floor((Date.now() - new Date(lead.lastTouchedAt || lead.lastContactAt).getTime()) / 86400000)
        : null;
      const temperature = lead.leadTemperature || 'unknown';
      const source = lead.source || 'unknown';
      const stage = lead.stage || lead.status || 'unknown';
      const tags = (lead.statusTags || []).join(', ') || 'none';
      const timeline = lead.timeline || lead.buyerTimeline || null;

      const prompt = `You are a real estate agent's assistant. Write a short, natural, personalized text message (under 160 characters) to send to a lead.

Lead context:
- Name: ${name}
- Lead temperature: ${temperature}
- Lead source: ${source}
- Stage: ${stage}
- Tags: ${tags}
${daysSinceContact !== null ? `- Days since last contact: ${daysSinceContact}` : '- Never contacted before'}
${timeline ? `- Timeline: ${timeline}` : ''}

Rules:
- Sound like a real person, not a bot
- Don't mention specific property prices or addresses (you don't have them)
- Start with "Hi ${name.split(' ')[0]}," or "Hey ${name.split(' ')[0]},"
- Be warm and low-pressure
- Under 160 characters
- Do NOT include quotes, preamble, or explanation — just the message text itself`;

      const data = await callClaude({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = data?.content?.[0]?.text?.trim();
      if (text) setAiTextDraft(text);
      else throw new Error('No response');
    } catch {
      toast({ title: 'AI unavailable', description: 'Could not generate a draft. Try again.', variant: 'destructive' });
    } finally {
      setAiTextLoading(false);
    }
  }, [context, entity]);

  if (!entity || !context || !draft) return null;

  const tabs: { key: WorkspaceTab; label: string; icon: typeof Phone }[] = [
    { key: 'call', label: 'Call', icon: Phone },
    { key: 'text', label: 'Text', icon: MessageSquare },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'task', label: 'Task', icon: ListTodo },
    { key: 'notes', label: 'Notes', icon: StickyNote },
    { key: 'intel', label: 'Intel', icon: TrendingUp },
    { key: 'prefs', label: 'Prefs', icon: Target },
  ];

  const displayEmail = editedEmail ?? emailBody;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        className="w-full md:max-w-2xl lg:max-w-4xl overflow-y-auto p-0"
        style={{
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <PanelErrorBoundary>
          {/* Header */}
          <div
            className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base leading-tight">{context.entityName}</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {entityType === 'deal' ? `${(entity as Deal).stage.replace('_', ' ')} · ${formatCurrency((entity as Deal).price)}` : `${(entity as Lead).leadTemperature || 'Lead'} · ${(entity as Lead).source}`}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', CONFIDENCE_STYLE[context.confidence.level])}>
                  {context.confidence.level}
                </span>
                {context.value > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                    {formatCurrency(context.value)}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 touch-manipulation" onClick={handleClose} aria-label="Close action composer">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Split layout: Context left, Execution right */}
          <div className="flex flex-col lg:flex-row min-h-0">
            {/* Left: Context — collapsible on mobile */}
            <div className="lg:w-[260px] lg:border-r lg:border-border lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto bg-background/50 shrink-0">
              {/* Mobile toggle — hidden on desktop */}
              <button
                className="lg:hidden w-full flex items-center justify-between px-4 py-2.5 border-b border-border hover:bg-accent/30 transition-colors"
                onClick={() => setContextOpen(o => !o)}
              >
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Context</span>
                {contextOpen
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </button>
              {/* Content — always visible on desktop, toggle on mobile */}
              <div className={cn('p-4', 'lg:block', contextOpen ? 'block' : 'hidden lg:block')}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 hidden lg:block">Context</p>
                <ContextPanel entity={entity} entityType={entityType} moneyResult={moneyResult} oppResult={oppResult} tasks={tasks} recentFubActivities={recentFubActivities} />
              </div>
            </div>

            {/* Right: Execution */}
            <div className="flex-1 min-w-0">
              {/* Tabs */}
              <div className="flex gap-0.5 px-4 py-2 border-b border-border overflow-x-auto">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap',
                        activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                      <Icon className="h-3.5 w-3.5" /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Post-Action Bar */}
              {showPostAction && (
                <div className="px-4 pt-3">
                  <PostActionBar onLogTouch={handlePostActionLogTouch} onScheduleFollowUp={handlePostActionFollowUp} onDone={handleClose} />
                </div>
              )}

              <div className="px-4 py-4 space-y-4">
                {/* CALL */}
                {activeTab === 'call' && (
                  <div className="space-y-4">
                    {/* Native dialer trigger */}
                    {(() => {
                      const phone = fubProfile?.phones?.[0];
                      return phone ? (
                        <a href={`tel:${phone}`} className="flex items-center justify-center gap-2 w-full h-12 min-h-[48px] rounded-lg bg-primary text-primary-foreground font-semibold text-base">
                          <Phone className="h-5 w-5" /> Call {context.entityName}
                        </a>
                      ) : (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-2">
                          <Phone className="h-5 w-5 mx-auto text-muted-foreground" />
                          <p className="text-sm font-medium">No phone number on file</p>
                          <p className="text-xs text-muted-foreground">Add a phone number in Follow Up Boss to enable calling.</p>
                        </div>
                      );
                    })()}

                    {/* Call brief */}
                    {callBrief && (
                      <>
                        <div className="rounded-md border border-primary/10 bg-primary/5 p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Goal</p>
                          <p className="text-sm font-medium">{callBrief.desiredOutcome}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Talking Points</p>
                          <ol className="space-y-1.5">
                            {callBrief.conversationFlow.map((step, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                                <span className="text-[10px] font-mono text-primary shrink-0 mt-0.5">{i + 1}.</span>{step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </>
                    )}

                    {!callOutcomeLogged && (
                      <div className="border-t border-border pt-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Log Outcome</p>
                        <div className="flex flex-wrap gap-2">
                          {CALL_OUTCOMES.map(o => (
                            <Button key={o.id} size="sm" variant="outline" className="text-xs" onClick={() => handleCallOutcome(o)}>{o.label}</Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {callOutcomeLogged && !showPostAction && (
                      <div className="rounded-md bg-opportunity/5 border border-opportunity/20 p-2.5 text-xs text-opportunity flex items-center gap-2">
                        <Check className="h-3.5 w-3.5" /> Outcome logged
                      </div>
                    )}
                    {/* Call History */}
                    {(() => {
                      const callHistory = recentFubActivities.filter(a =>
                        ['call', 'calls'].includes(a.activity_type)
                      );
                      if (callHistory.length === 0) return null;
                      return (
                        <div className="border-t border-border pt-3 space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Call History</p>
                          {callHistory.slice(0, 8).map((a, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/30">
                              {a.direction === 'inbound' ? <ArrowDownLeft className="h-3 w-3 text-opportunity shrink-0 mt-0.5" /> : <ArrowUpRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-muted-foreground">{a.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'}{a.duration_seconds ? ` · ${Math.ceil(a.duration_seconds / 60)}m` : ''}</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(a.occurred_at).toLocaleDateString()} {new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TEXT */}
                {activeTab === 'text' && (
                  <div className="space-y-3">
                    {/* Native SMS trigger */}
                    {(() => {
                      const phone = fubProfile?.phones?.[0];
                      return phone ? (
                        <a href={`sms:${phone}`} className="flex items-center justify-center gap-2 w-full h-12 min-h-[48px] rounded-lg bg-primary text-primary-foreground font-semibold text-base">
                          <MessageSquare className="h-5 w-5" /> Text {context.entityName}
                        </a>
                      ) : (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-2">
                          <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground" />
                          <p className="text-sm font-medium">No phone number on file</p>
                          <p className="text-xs text-muted-foreground">Add a phone number in Follow Up Boss to enable texting.</p>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Templates</p>
                      <div className="flex items-center gap-2">
                        {fubPersonId && (
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-muted-foreground">Quick Send</Label>
                            <Switch checked={quickSendMode} onCheckedChange={setQuickSendMode} className="scale-75" />
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          onClick={handleAiTextPersonalize}
                          disabled={aiTextLoading}
                        >
                          {aiTextLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {aiTextLoading ? 'Writing…' : `Personalize for ${context.entityName.split(' ')[0]}`}
                        </Button>
                      </div>
                    </div>

                    {/* AI-generated draft */}
                    {aiTextDraft && (
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <p className="text-[10px] font-medium text-primary uppercase tracking-wider">AI Draft</p>
                          <span className={cn('text-[10px] ml-auto', aiTextDraft.length > 155 ? 'text-destructive' : 'text-muted-foreground')}>
                            {aiTextDraft.length}/160
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed">{aiTextDraft}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 gap-1"
                            onClick={() => { handleCopy(aiTextDraft, 'ai-sms'); }}>
                            {copiedField === 'ai-sms' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedField === 'ai-sms' ? 'Copied' : 'Copy'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 gap-1 text-muted-foreground"
                            onClick={handleAiTextPersonalize} disabled={aiTextLoading}>
                            <Sparkles className="h-3 w-3" /> Regenerate
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 gap-1 text-muted-foreground ml-auto"
                            onClick={() => setAiTextDraft(null)}>
                            <X className="h-3 w-3" /> Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                    </div>
                    {smsVariants.map((v, i) => (
                      <button key={i} onClick={() => setSelectedSmsIndex(i)}
                        className={cn('w-full text-left rounded-md border p-2.5 transition-colors', i === selectedSmsIndex ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30')}>
                        <p className="text-[10px] text-muted-foreground font-medium mb-0.5">{v.label}</p>
                        <p className="text-xs">{v.text}</p>
                      </button>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCopy(smsVariants[selectedSmsIndex]?.text || '', 'sms')}>
                        {copiedField === 'sms' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        {copiedField === 'sms' ? 'Copied' : 'Copy Text'}
                      </Button>
                      {textSent ? (
                        <div className="flex items-center gap-1.5 text-xs text-opportunity px-2">
                          <Check className="h-3.5 w-3.5" /> Sent via FUB
                        </div>
                      ) : fubPersonId ? (
                        <Button size="sm" className="text-xs" disabled={sending} onClick={async () => {
                          const msg = smsVariants[selectedSmsIndex]?.text || '';
                          if (!msg) return;
                          if (quickSendMode) {
                            const ok = await sendText(msg);
                            if (ok) setTextSent(true);
                          } else {
                            if (confirm(`Send this text via FUB?\n\n"${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}"`)) {
                              const ok = await sendText(msg);
                              if (ok) setTextSent(true);
                            }
                          }
                        }}>
                          {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                          Send via FUB
                        </Button>
                      ) : null}
                    </div>

                    {/* Text History */}
                    {(() => {
                      const textHistory = recentFubActivities.filter(a =>
                        ['text', 'sms', 'textMessage', 'textMessages'].includes(a.activity_type)
                      );
                      if (textHistory.length === 0) return null;
                      return (
                        <div className="border-t border-border pt-3 space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Text History</p>
                          {textHistory.slice(0, 8).map((a, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/30">
                              {a.direction === 'inbound' ? <ArrowDownLeft className="h-3 w-3 text-opportunity shrink-0 mt-0.5" /> : <ArrowUpRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-muted-foreground truncate">{a.body_preview || 'No preview'}</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(a.occurred_at).toLocaleDateString()} {new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* EMAIL */}
                {activeTab === 'email' && draft && (
                  <div className="space-y-3">
                    {/* Native mail trigger */}
                    {(() => {
                      const email = fubProfile?.emails?.[0];
                      return email ? (
                        <a href={`mailto:${email}?subject=${encodeURIComponent(draft.email.subject)}`} className="flex items-center justify-center gap-2 w-full h-12 min-h-[48px] rounded-lg bg-primary text-primary-foreground font-semibold text-base">
                          <Mail className="h-5 w-5" /> Email {context.entityName}
                        </a>
                      ) : (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-2">
                          <Mail className="h-5 w-5 mx-auto text-muted-foreground" />
                          <p className="text-sm font-medium">No email address on file</p>
                          <p className="text-xs text-muted-foreground">Add an email address in Follow Up Boss to enable emailing.</p>
                        </div>
                      );
                    })()}

                    <div>
                      <Label className="text-xs">Subject</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input value={draft.email.subject} readOnly className="text-sm h-8" />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleCopy(draft.email.subject, 'subject')}>
                          {copiedField === 'subject' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Body</Label>
                        <div className="flex gap-1">
                          {(['direct', 'professional', 'friendly'] as EmailTone[]).map(t => (
                            <button key={t} onClick={() => { setEmailTone(t); setEditedEmail(null); }}
                              className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize', emailTone === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <Textarea value={displayEmail} onChange={e => setEditedEmail(e.target.value)} className="min-h-[180px] text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCopy(displayEmail, 'email')}>
                        {copiedField === 'email' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        {copiedField === 'email' ? 'Copied' : 'Copy Email'}
                      </Button>
                      {emailSent ? (
                        <div className="flex items-center gap-1.5 text-xs text-opportunity px-2">
                          <Check className="h-3.5 w-3.5" /> Sent via FUB
                        </div>
                      ) : fubPersonId ? (
                        <Button size="sm" className="text-xs" disabled={sending} onClick={async () => {
                          if (confirm(`Send this email via FUB?\n\nSubject: ${draft.email.subject}`)) {
                            const ok = await sendEmail(draft.email.subject, displayEmail);
                            if (ok) setEmailSent(true);
                          }
                        }}>
                          {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                          Send via FUB
                        </Button>
                      ) : null}
                    </div>

                    {/* Email History */}
                    {(() => {
                      const emailHistory = recentFubActivities.filter(a =>
                        ['email', 'emails'].includes(a.activity_type)
                      );
                      if (emailHistory.length === 0) return null;
                      return (
                        <div className="border-t border-border pt-3 space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Email History</p>
                          {emailHistory.slice(0, 8).map((a, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/30">
                              {a.direction === 'inbound' ? <ArrowDownLeft className="h-3 w-3 text-opportunity shrink-0 mt-0.5" /> : <ArrowUpRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                              <div className="min-w-0 flex-1">
                                {a.subject && <p className="font-medium text-foreground truncate">{a.subject}</p>}
                                <p className="text-muted-foreground truncate">{a.body_preview || 'No preview'}</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(a.occurred_at).toLocaleDateString()} {new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TASK */}
                {activeTab === 'task' && (
                  <div className="space-y-3">
                    {!taskCreated ? (
                      <>
                        <div>
                          <Label className="text-xs">Task Title</Label>
                          <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder={`Follow up with ${context.entityName}`} className="mt-1 h-8 text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Select value={taskType} onValueChange={v => setTaskType(v as TaskType)}>
                              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['call', 'text', 'email', 'follow_up', 'showing', 'closing'].map(t => (
                                  <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace('_', ' ')}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Due</Label>
                            <Input type="date" value={taskDueAt ? new Date(taskDueAt).toISOString().split('T')[0] : new Date(smartDueDate).toISOString().split('T')[0]} onChange={e => setTaskDueAt(new Date(e.target.value).toISOString())} className="mt-1 h-8 text-xs" />
                          </div>
                        </div>
                        <Button size="sm" onClick={handleCreateTask} disabled={!taskTitle.trim()}>
                          <ListTodo className="h-3 w-3 mr-1" /> Create Task
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-md bg-opportunity/5 border border-opportunity/20 p-2.5 text-xs text-opportunity flex items-center gap-2">
                        <Check className="h-3.5 w-3.5" /> Task created
                      </div>
                    )}
                  </div>
                )}

                {/* NOTES */}
                {activeTab === 'notes' && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Quick Note</Label>
                      <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Capture key points..." className="mt-1 min-h-[80px] text-xs" />
                    </div>
                    <Button size="sm" onClick={(e) => handleLogNote(e)} disabled={!noteText.trim()}>
                      <StickyNote className="h-3 w-3 mr-1" /> Save Note
                    </Button>

                    {savedNotes.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saved Notes</p>
                        {savedNotes.map(n => (
                          <div key={n.id} className="text-xs p-2.5 rounded-md border border-border bg-muted/30 group/note">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-foreground whitespace-pre-wrap flex-1">{n.note}</p>
                              <button
                                onClick={async () => {
                                  await supabase.from('activity_events').delete().eq('id', n.id);
                                  setSavedNotes(prev => prev.filter(x => x.id !== n.id));
                                }}
                                className="opacity-0 group-hover/note:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                                aria-label="Delete note"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-muted-foreground text-[10px] mt-1">
                              {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* INTEL */}
                {activeTab === 'intel' && entity && (
                  <div className="space-y-4">
                    {context.entityType === 'lead' && (
                      <ClientCommitmentPanel
                        lead={entity as Lead}
                        oppResult={oppResult ?? null}
                        fubProfile={fubProfile}
                        tasks={(tasks || []).map(t => ({ relatedLeadId: t.relatedLeadId, completedAt: t.completedAt ?? undefined }))}
                        fubActivities={recentFubActivities}
                      />
                    )}

                    {/* FUB Activity Summary */}
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activity Summary</p>
                      {recentFubActivities.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md bg-muted/30 p-2">
                            <p className="text-muted-foreground">Last Contact</p>
                            <p className="font-medium">{new Date(recentFubActivities[0].occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                          <div className="rounded-md bg-muted/30 p-2">
                            <p className="text-muted-foreground">Total Activities</p>
                            <p className="font-medium">{recentFubActivities.length}</p>
                          </div>
                          <div className="rounded-md bg-muted/30 p-2 col-span-2">
                            <p className="text-muted-foreground">Most Recent</p>
                            <p className="font-medium capitalize">{recentFubActivities[0].activity_type} · {recentFubActivities[0].direction === 'inbound' ? 'Incoming' : 'Outgoing'}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No FUB activity found for this lead.</p>
                      )}
                    </div>

                    {/* Outside Target Badge */}
                    {context.entityType === 'lead' && (() => {
                      const lead = entity as Lead;
                      // Check target market from profile (loaded via fubProfile zip)
                      const fubZip = fubProfile?.zipCode;
                      return fubZip ? null : null; // Target check is done at pipeline level
                    })()}

                    {context.entityType === 'lead' && (
                      <ClientFitPanel
                        entityId={context.entityId}
                        entityType="lead"
                        entityName={context.entityName}
                        entity={entity}
                      />
                    )}
                    <LocalIntelBriefPanel
                      entityId={context.entityId}
                      entityType={context.entityType}
                      entityName={context.entityName}
                      entity={entity}
                      externalPersonProfile={fubProfile}
                    />
                  </div>
                )}

                {/* PREFERENCES */}
                {activeTab === 'prefs' && entity && (
                  <div className="space-y-4">
                    {/* Snooze Until */}
                    {context.entityType === 'lead' && (
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-xs font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Snooze / Return Date</p>
                        <p className="text-[10px] text-muted-foreground">Hide this lead until a specific date, then it will automatically resurface.</p>
                        {(entity as Lead).snoozeUntil && new Date((entity as Lead).snoozeUntil!) > new Date() && (
                          <div className="text-xs text-warning font-medium">Currently snoozed until {new Date((entity as Lead).snoozeUntil!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            defaultValue={(entity as Lead).snoozeUntil ? new Date((entity as Lead).snoozeUntil!).toISOString().split('T')[0] : ''}
                            className="h-10 text-sm flex-1"
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (!val) return;
                              await supabase.from('leads').update({ snooze_until: new Date(val).toISOString() } as any).eq('id', (entity as Lead).id);
                              toast({ description: 'Snooze date saved.' });
                            }}
                          />
                          {(entity as Lead).snoozeUntil && (
                            <Button variant="outline" size="sm" className="h-10 text-xs" onClick={async () => {
                              await supabase.from('leads').update({ snooze_until: null } as any).eq('id', (entity as Lead).id);
                              toast({ description: 'Snooze cleared.' });
                            }}>Clear</Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Private Notes for this lead */}
                    {context.entityType === 'lead' && (
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-xs font-medium flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" /> Notes for this lead</p>
                        <p className="text-[10px] text-muted-foreground">Private notes about working style, preferences, or context.</p>
                        <Textarea
                          defaultValue={(entity as Lead).notes || ''}
                          placeholder="E.g. Prefers evening calls, wants a pool, relocating from Dallas..."
                          className="min-h-[80px] text-xs"
                          onBlur={async (e) => {
                            const val = e.target.value;
                            await supabase.from('leads').update({ notes: val } as any).eq('id', (entity as Lead).id);
                            toast({ description: 'Notes saved.' });
                          }}
                        />
                      </div>
                    )}

                    <ClientPreferencesPanel
                      entityId={context.entityId}
                      entityType={context.entityType}
                      entityName={context.entityName}
                      entity={entity}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
