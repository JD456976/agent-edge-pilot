import { useState, useMemo, useCallback, useEffect } from 'react';
import { Phone, MessageSquare, Mail, ListTodo, StickyNote, Copy, Check, Shield, Target, X, ChevronDown, ChevronUp, Zap, Send, Clock, ArrowUpRight, ArrowDownLeft, Loader2, CalendarDays, Activity, Flame, StickyNote as NotesIcon, History, AlertTriangle, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { relativeTime } from '@/lib/relativeTime';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { LocalIntelBriefPanel } from '@/components/LocalIntelBriefPanel';
import { ClientPreferencesPanel } from '@/components/ClientPreferencesPanel';
import { ClientFitPanel } from '@/components/ClientFitPanel';
import { ClientCommitmentPanel } from '@/components/ClientCommitmentPanel';
import { MessageTemplatesSheet, TemplatesButton } from '@/components/MessageTemplatesSheet';
import { FubContextStrip } from '@/components/FubContextStrip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFubSend } from '@/hooks/useFubSend';
import { toast } from '@/hooks/use-toast';
import type { Deal, Lead, Task, TaskType } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { FubPersonProfile, FubActivity } from '@/lib/intelAnalyzer';
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
  type FollowUpSuggestion,
  type ConfidenceLevel,
} from '@/lib/executionEngine';

// ── Types ────────────────────────────────────────────────────────────

type WorkspaceTab = 'call' | 'text' | 'email' | 'task' | 'notes' | 'activity' | 'intel' | 'prefs';

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
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-opportunity/10 text-opportunity border-opportunity/20',
  MEDIUM: 'bg-warning/10 text-warning border-warning/20',
  LOW: 'bg-muted text-muted-foreground border-border',
};

function getEntityContext(entity: Deal | Lead, entityType: 'deal' | 'lead', moneyResult?: MoneyModelResult | null, oppResult?: OpportunityHeatResult | null): string {
  if (entityType === 'deal') {
    const deal = entity as Deal;
    if (deal.riskLevel === 'red') return 'Deal at Risk';
    if (deal.riskLevel === 'yellow') return 'At Risk';
    if (deal.stage === 'pending') return 'Pending Close';
    return `${deal.stage.replace('_', ' ')}`;
  }
  const lead = entity as Lead;
  if (lead.leadTemperature === 'hot') return 'Hot Lead';
  if (lead.leadTemperature === 'warm') return 'Warm Lead';
  return 'Lead';
}

// ── Call Outcome Buttons ─────────────────────────────────────────────

const CALL_OUTCOMES = [
  { id: 'no_answer', label: 'No Answer', touchType: 'call', note: 'Called — no answer' },
  { id: 'spoke_briefly', label: 'Spoke Briefly', touchType: 'call', note: 'Had a brief conversation' },
  { id: 'scheduled_meeting', label: 'Scheduled Meeting', touchType: 'call', note: 'Scheduled a meeting' },
  { id: 'needs_followup', label: 'Needs Follow-Up', touchType: 'call', note: 'Needs follow-up' },
] as const;

// ── SMS Templates ────────────────────────────────────────────────────

function generateSmsVariants(name: string, context: string, profile?: FubPersonProfile | null): { label: string; text: string }[] {
  const stage = profile?.stage ? ` regarding your ${profile.stage.toLowerCase()} search` : '';
  const timeframe = profile?.timeFrame ? ` I know your ${profile.timeFrame.toLowerCase()} timeline` : '';
  const preApproval = profile?.preApproved ? ' — and congrats on the pre-approval!' : '';
  return [
    { label: 'Short', text: `Hi ${name}, checking in${stage} — do you have a moment to connect today?` },
    { label: 'Contextual', text: `Hi ${name}, I wanted to follow up${stage}.${timeframe ? timeframe + ' is important, so' : ''} I have some updates to share.${preApproval} Are you available for a quick chat?` },
    { label: 'Friendly', text: `Hey ${name}! Hope you're doing well. I've been thinking about your situation${stage} and had a few ideas. Would love to chat when you have a moment 😊` },
  ];
}

// ── Email Tones ──────────────────────────────────────────────────────

type EmailTone = 'direct' | 'friendly' | 'professional';
type EmailLength = 'short' | 'medium' | 'detailed';

function adjustEmailTone(body: string, tone: EmailTone): string {
  if (tone === 'direct') {
    return body.replace(/I hope you're doing well\.\s*/g, '').replace(/I wanted to/g, 'I need to').replace(/Best regards/g, 'Thanks');
  }
  if (tone === 'friendly') {
    return body.replace(/Best regards/g, 'Looking forward to hearing from you!\n\nWarmly');
  }
  return body;
}

function adjustEmailLength(body: string, length: EmailLength): string {
  if (length === 'short') {
    const lines = body.split('\n').filter(l => l.trim());
    return lines.slice(0, Math.min(4, lines.length)).join('\n');
  }
  if (length === 'detailed') {
    return body + '\n\nP.S. I\'m always available if you have any questions or want to discuss further.';
  }
  return body;
}

// ── Smart Due Date Defaults ──────────────────────────────────────────

function getSmartDueDate(entity: Deal | Lead, entityType: 'deal' | 'lead'): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  if (entityType === 'deal') {
    const deal = entity as Deal;
    if (deal.riskLevel === 'red') return new Date().toISOString(); // Today
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

// ── Main Component ───────────────────────────────────────────────────

export function ActionWorkspaceDrawer({
  open, onClose, entity, entityType,
  moneyResult, oppResult, tasks,
  onCreateTask, onLogTouch, onCompleteTask,
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('call');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showObjections, setShowObjections] = useState(false);
  const [callOutcomeLogged, setCallOutcomeLogged] = useState(false);

  // Text tab state
  const [selectedSmsIndex, setSelectedSmsIndex] = useState(0);
  const [quickSendModeText, setQuickSendModeText] = useState(false);
  const [quickSendModeEmail, setQuickSendModeEmail] = useState(false);
  const [textSent, setTextSent] = useState(false);
  const [showTextTemplates, setShowTextTemplates] = useState(false);
  const [showEmailTemplates, setShowEmailTemplates] = useState(false);

  // Email tab state
  const [emailTone, setEmailTone] = useState<EmailTone>('professional');
  const [emailLength, setEmailLength] = useState<EmailLength>('medium');
  const [editedEmail, setEditedEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Listing writer state
  const [showListingWriter, setShowListingWriter] = useState(false);
  const [listingAddress, setListingAddress] = useState('');
  const [listingBeds, setListingBeds] = useState('');
  const [listingBaths, setListingBaths] = useState('');
  const [listingFeatures, setListingFeatures] = useState('');
  const [listingResult, setListingResult] = useState('');
  const [listingLoading, setListingLoading] = useState(false);

  // Task tab state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('follow_up');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);

  // AI Opener state
  const [openerResult, setOpenerResult] = useState<Record<string, string>>({});
  const [openerLoading, setOpenerLoading] = useState<string | null>(null);
  const [openerExpanded, setOpenerExpanded] = useState<Record<string, boolean>>({ call: true, text: true, email: true });

  // Notes tab state
  const [noteText, setNoteText] = useState('');
  const [savedNotes, setSavedNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);

  // FUB enrichment state
  const [fubProfile, setFubProfile] = useState<FubPersonProfile | null>(null);
  const [recentFubActivities, setRecentFubActivities] = useState<FubActivity[]>([]);
  const [fubPersonId, setFubPersonId] = useState<number | null>(null);

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
    const raw = (data || []) as Array<{ id: string; note: string; created_at: string }>;
    // Filter out soft-deleted notes and deduplicate consecutive identical notes within 1 hour
    const filtered = raw.filter(n => n.note !== '[deleted]');
    const deduped = filtered.filter((note, index) => {
      if (index === 0) return true;
      const prev = filtered[index - 1];
      if (note.note === prev.note) {
        const timeDiff = Math.abs(new Date(note.created_at).getTime() - new Date(prev.created_at).getTime());
        return timeDiff > 60 * 60 * 1000;
      }
      return true;
    });
    setSavedNotes(deduped.slice(0, 15));
  }, []);

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

  // Derived data
  const context = useMemo((): ExecutionContext | null => {
    if (!entity) return null;
    return buildExecutionContext(entity, entityType, moneyResult, oppResult, tasks);
  }, [entity, entityType, moneyResult, oppResult, tasks]);

  // FUB send hook
  const fubSendOptions = useMemo(() => {
    if (!fubPersonId || !context) return null;
    return { fubPersonId, entityId: context.entityId, entityType: context.entityType };
  }, [fubPersonId, context]);
  const { sendText, sendEmail, sending } = useFubSend(fubSendOptions);

  // Load FUB activities and profile
  useEffect(() => {
    if (!entity || !open || !fubPersonId) {
      setRecentFubActivities([]);
      setFubProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { callEdgeFunction } = await import('@/lib/edgeClient');
        const result = await callEdgeFunction('fub-activity', {
          fub_person_id: fubPersonId,
          entity_id: (entity as any).id,
          limit: 25,
        });
        if (!cancelled && result) {
          setRecentFubActivities(result.activities || []);
          if (result.personProfile) setFubProfile(result.personProfile as FubPersonProfile);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [entity, open, fubPersonId]);

  useEffect(() => {
    if (entity && context && open) {
      loadNotes(context.entityType, context.entityId);
    }
  }, [entity, open, context, loadNotes]);


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
    const contextStr = context.riskSignals[0] || '';
    return generateSmsVariants(context.entityName, contextStr, fubProfile);
  }, [context, fubProfile]);

  const emailBody = useMemo(() => {
    if (!draft) return '';
    let body = draft.email.body;
    body = adjustEmailTone(body, emailTone);
    body = adjustEmailLength(body, emailLength);
    return body;
  }, [draft, emailTone, emailLength]);

  const entityContextLabel = useMemo(() => {
    if (!entity) return '';
    return getEntityContext(entity, entityType, moneyResult, oppResult);
  }, [entity, entityType, moneyResult, oppResult]);

  // Smart defaults for task tab
  const smartDueDate = useMemo(() => {
    if (!entity) return new Date().toISOString();
    return getSmartDueDate(entity, entityType);
  }, [entity, entityType]);

  // Reset state when entity changes
  const handleClose = useCallback(() => {
    setCallOutcomeLogged(false);
    setSelectedSmsIndex(0);
    setEditedEmail(null);
    setEmailTone('professional');
    setEmailLength('medium');
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
    setQuickSendModeText(false);
    setQuickSendModeEmail(false);
    setFubProfile(null);
    setRecentFubActivities([]);
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
    setCallOutcomeLogged(true);
  }, [context, onLogTouch]);

  const handleCreateTask = useCallback(() => {
    if (!context || !taskTitle.trim()) return;
    const dueAt = taskDueAt || smartDueDate;
    onCreateTask?.(taskTitle, taskType, dueAt, context.entityId, context.entityType);
    setTaskCreated(true);
  }, [context, taskTitle, taskType, taskDueAt, smartDueDate, onCreateTask]);

  const { user } = useAuth();

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

  const handleFetchOpener = useCallback(async (channel: 'call' | 'text' | 'email') => {
    if (!context) return;
    setOpenerLoading(channel);
    try {
      const { data, error } = await supabase.functions.invoke('ai-follow-up', {
        body: {
          entity_type: context.entityType,
          entity_id: context.entityId,
          draft_type: 'opener',
          channel,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ description: data.message || data.error, variant: 'destructive' });
      } else if (data?.opener) {
        setOpenerResult(prev => ({ ...prev, [channel]: data.opener }));
      }
    } catch (err) {
      console.error('Opener fetch error:', err);
      toast({ description: 'Could not generate suggestion', variant: 'destructive' });
    } finally {
      setOpenerLoading(null);
    }
  }, [context]);

  const renderOpenerSection = (channel: 'call' | 'text' | 'email', useLabel: string, onUse: (text: string) => void) => {
    const isExpanded = openerExpanded[channel] ?? true;
    const isLoading = openerLoading === channel;
    const result = openerResult[channel];
    return (
      <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/30 transition-colors"
          onClick={() => setOpenerExpanded(prev => ({ ...prev, [channel]: !prev[channel] }))}
        >
          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <Sparkles className="h-3 w-3 text-primary" /> AI Suggested Opener
          </span>
          {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </button>
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {!result && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1.5"
                disabled={isLoading}
                onClick={() => handleFetchOpener(channel)}
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {isLoading ? 'Generating…' : '✨ Suggest'}
              </Button>
            )}
            {result && (
              <div className="space-y-2">
                <p className="text-sm text-foreground italic">"{result}"</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" className="text-xs h-7 gap-1" onClick={() => onUse(result)}>
                    <Check className="h-3 w-3" /> {useLabel}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => handleFetchOpener(channel)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Regenerate
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const tabs: { key: WorkspaceTab; label: string; icon: typeof Phone; subtitle: string }[] = [
    { key: 'intel', label: 'Intel', icon: Zap, subtitle: 'Data brief' },
    { key: 'prefs', label: 'Preferences', icon: Target, subtitle: 'Client wants' },
    { key: 'call', label: 'Call', icon: Phone, subtitle: 'Script & outcomes' },
    { key: 'text', label: 'Text', icon: MessageSquare, subtitle: 'SMS templates' },
    { key: 'email', label: 'Email', icon: Mail, subtitle: 'Draft & send' },
    { key: 'task', label: 'Task', icon: ListTodo, subtitle: 'Create follow-up' },
    { key: 'notes', label: 'Notes', icon: StickyNote, subtitle: 'Quick note' },
    { key: 'activity', label: 'Activity', icon: History, subtitle: 'Timeline' },
  ];

  const displayEmail = editedEmail ?? emailBody;

  return (
    <>
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        hideClose
        className="w-full md:max-w-lg overflow-y-auto p-0"
        style={{
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <PanelErrorBoundary>
          {/* Header */}
          <div
            className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base leading-tight">{context.entityName}</SheetTitle>
                {(fubProfile?.phones?.[0] || fubProfile?.emails?.[0]) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {fubProfile.phones?.[0] && (
                      <a href={`tel:${fubProfile.phones[0]}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                        <Phone className="h-3 w-3" />{fubProfile.phones[0]}
                      </a>
                    )}
                    {fubProfile.emails?.[0] && (
                      <a href={`mailto:${fubProfile.emails[0]}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3" />{fubProfile.emails[0]}
                      </a>
                    )}
                  </div>
                )}
                <SheetDescription className="text-xs mt-0.5">{entityContextLabel}</SheetDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {fubProfile?.stage && (
                  <Badge variant="secondary" className="text-[10px]">
                    {fubProfile.stage}
                  </Badge>
                )}
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', CONFIDENCE_STYLE[context.confidence.level])}>
                  {context.confidence.level}
                </span>
                {context.value > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                    {formatCurrency(context.value)}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 touch-manipulation"
                  onClick={handleClose}
                  aria-label="Close action workspace"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{context.confidence.reason}</p>
            {/* FUB Context: Stage, Timeframe, Lender, AT A GLANCE */}
            {entity && (
              <div className="mt-2">
                <FubContextStrip
                  entityId={context.entityId}
                  entity={entity}
                  personProfile={fubProfile}
                />
              </div>
            )}
            {/* Milestone checklist for deals */}
            {context.entityType === 'deal' && (entity as any)?.milestoneStatus && (
              <div className="mt-2 space-y-1">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Milestones</p>
                {(['inspection', 'financing', 'appraisal'] as const).map(key => {
                  const val = (entity as any).milestoneStatus?.[key] || 'unknown';
                  const colors: Record<string, string> = { unknown: 'text-amber-500', scheduled: 'text-blue-500', ordered: 'text-blue-500', preapproved: 'text-blue-500', complete: 'text-green-500', approved: 'text-green-500' };
                  return (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="capitalize text-muted-foreground">{key}</span>
                      <span className={cn('capitalize font-medium', colors[val] || 'text-muted-foreground')}>
                        {val.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {recentFubActivities.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Recent Activity</p>
                <div className="space-y-0.5">
                  {recentFubActivities.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {a.direction === 'inbound' ? (
                        <ArrowDownLeft className="h-2.5 w-2.5 text-primary shrink-0" />
                      ) : (
                        <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium capitalize">{a.activity_type}</span>
                      {a.subject && <span className="truncate max-w-[140px]">— {a.subject}</span>}
                      <span className="ml-auto text-[10px] shrink-0">
                        {new Date(a.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tab selector */}
          <div className="flex gap-0.5 px-5 py-3 border-b border-border overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors whitespace-nowrap',
                    activeTab === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="px-5 py-4 space-y-4">

            {/* ── INTEL TAB ────────────────────────────────────────── */}
            {activeTab === 'intel' && entity && (
              <div className="space-y-4">
                {/* Quick Actions strip — leads only */}
                {context.entityType === 'lead' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5"
                      onClick={() => setActiveTab('call')}>
                      <Phone className="h-3 w-3" /> Call
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5"
                      onClick={() => setActiveTab('text')}>
                      <MessageSquare className="h-3 w-3" /> Text
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5"
                      onClick={() => setActiveTab('task')}>
                      <ListTodo className="h-3 w-3" /> Add Task
                    </Button>
                  </div>
                )}
                {/* Contact Summary — always renders for leads */}
                {context.entityType === 'lead' && (() => {
                  const lead = entity as Lead;
                  const now = Date.now();
                  const daysSinceCreated = lead.createdAt ? Math.floor((now - new Date(lead.createdAt).getTime()) / 86400000) : null;
                  const daysSinceTouch = lead.lastTouchedAt ? Math.floor((now - new Date(lead.lastTouchedAt).getTime()) / 86400000) : null;
                  const engScore = lead.engagementScore ?? 0;
                  const tempColor = lead.leadTemperature === 'hot' ? 'text-urgent' : lead.leadTemperature === 'warm' ? 'text-warning' : 'text-muted-foreground';
                  const tempLabel = lead.leadTemperature ? lead.leadTemperature.charAt(0).toUpperCase() + lead.leadTemperature.slice(1) : null;
                  return (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Contact Summary</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">First contact</span>
                          <span className="ml-auto font-medium">{daysSinceCreated != null ? `${daysSinceCreated}d ago` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Last touch</span>
                          <span className="ml-auto font-medium">{daysSinceTouch != null ? `${daysSinceTouch}d ago` : '—'}</span>
                        </div>
                        <div className="col-span-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">Engagement</span>
                            </div>
                            <span className={cn("font-medium", engScore >= 70 ? 'text-opportunity' : engScore >= 40 ? 'text-warning' : 'text-muted-foreground')}>{engScore}/100</span>
                          </div>
                          <Progress value={engScore} className="h-1.5" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Source</span>
                          <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">{lead.source || '—'}</Badge>
                        </div>
                        {tempLabel && (
                          <div className="flex items-center gap-1.5">
                            <Flame className="h-3 w-3 shrink-0" />
                            <span className="text-muted-foreground">Temperature</span>
                            <Badge variant="outline" className={cn("ml-auto text-[10px] h-4 px-1.5", tempColor)}>{tempLabel}</Badge>
                          </div>
                        )}
                      </div>
                      {lead.notes && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
                            <StickyNote className="h-3 w-3" /> Agent Notes
                          </p>
                          <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4">{lead.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {context.entityType === 'lead' && (
                  <ClientFitPanel
                    entityId={context.entityId}
                    entityType="lead"
                    entityName={context.entityName}
                    entity={entity}
                  />
                )}
                {context.entityType === 'lead' && (
                  <ClientCommitmentPanel
                    lead={entity as Lead}
                    oppResult={oppResult ?? null}
                    fubProfile={fubProfile}
                    tasks={(tasks || []).map(t => ({ relatedLeadId: t.relatedLeadId, completedAt: t.completedAt ?? undefined }))}
                    fubActivities={recentFubActivities}
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
            {/* ── PREFERENCES TAB ─────────────────────────────────── */}
            {activeTab === 'prefs' && entity && (
              <ClientPreferencesPanel
                entityId={context.entityId}
                entityType={context.entityType}
                entityName={context.entityName}
                entity={entity}
                fubActivities={recentFubActivities}
                personProfile={fubProfile}
              />
            )}

            {/* ── CALL TAB ─────────────────────────────────────────── */}
            {activeTab === 'call' && callBrief && (
              <div className="space-y-4">
                {renderOpenerSection('call', 'Copy opener', (text) => {
                  navigator.clipboard.writeText(text);
                  toast({ description: 'Opener copied to clipboard' });
                })}
                {/* Call History from FUB */}
                {(() => {
                  const callHistory = recentFubActivities.filter(a => a.activity_type === 'call' || a.activity_type === 'phone');
                  if (callHistory.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Call History (FUB)</p>
                      <div className="space-y-1 max-h-[180px] overflow-y-auto">
                        {callHistory.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md border border-border bg-muted/30">
                            <div className="shrink-0 mt-0.5">
                              {a.direction === 'inbound' ? (
                                <ArrowDownLeft className="h-3 w-3 text-primary" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium capitalize">{a.direction || 'outbound'} call</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(a.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  {' '}
                                  {new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {a.body_preview && <p className="text-muted-foreground truncate mt-0.5">{a.body_preview}</p>}
                              {a.duration_seconds != null && a.duration_seconds > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Duration: {Math.floor(a.duration_seconds / 60)}m {a.duration_seconds % 60}s
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Goal */}
                <div className="rounded-md border border-primary/10 bg-primary/5 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Goal of Call</p>
                  <p className="text-sm font-medium">{callBrief.desiredOutcome}</p>
                </div>

                {/* Talking Points */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Suggested Talking Points</p>
                  <ol className="space-y-1.5">
                    {callBrief.conversationFlow.map((step, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-[10px] font-mono text-primary shrink-0 mt-0.5">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Key Risks */}
                {callBrief.keyRisks.length > 0 && callBrief.keyRisks[0] !== 'No active risk flags' && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Likely Objections</p>
                    <div className="space-y-1.5">
                      {callBrief.keyRisks.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Shield className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Objections (expandable) */}
                {objections.length > 0 && (
                  <div>
                    <button onClick={() => setShowObjections(!showObjections)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {showObjections ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      View Objection Responses ({objections.length})
                    </button>
                    {showObjections && (
                      <div className="space-y-2 mt-2">
                        {objections.map((obj, i) => (
                          <div key={i} className="rounded-md border border-border bg-background/50 p-3 space-y-1">
                            <p className="text-xs font-medium">{obj.objection}</p>
                            <p className="text-xs text-muted-foreground">{obj.response}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Script template */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Short Script</p>
                    <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => handleCopy(draft.callPoints.join('\n'), 'script')}>
                      {copiedField === 'script' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedField === 'script' ? 'Copied' : 'Copy Script'}
                    </Button>
                  </div>
                  <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground space-y-1">
                    {draft.callPoints.map((point, i) => (
                      <p key={i}>• {point}</p>
                    ))}
                  </div>
                </div>

                {/* Outcome Buttons */}
                <div className="border-t border-border pt-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Log Call Outcome</p>
                  {callOutcomeLogged ? (
                    <div className="flex items-center gap-2 text-sm text-opportunity">
                      <Check className="h-4 w-4" />
                      <span>Call logged successfully</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {CALL_OUTCOMES.map(outcome => (
                        <Button
                          key={outcome.id}
                          size="sm"
                          variant="outline"
                          className="text-xs justify-start"
                          onClick={() => handleCallOutcome(outcome)}
                        >
                          {outcome.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TEXT TAB ─────────────────────────────────────────── */}
            {activeTab === 'text' && (
              <div className="space-y-4">
                {renderOpenerSection('text', 'Insert opener', (text) => {
                  // Insert opener at start of selected SMS variant text
                  if (selectedSmsIndex >= 0 && smsVariants[selectedSmsIndex]) {
                    navigator.clipboard.writeText(text + ' ' + smsVariants[selectedSmsIndex].text);
                    toast({ description: 'Opener + message copied — paste into your SMS app' });
                  } else {
                    navigator.clipboard.writeText(text);
                    toast({ description: 'Opener copied to clipboard' });
                  }
                })}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested Messages</p>
                  <div className="flex items-center gap-2">
                    <TemplatesButton onClick={() => setShowTextTemplates(true)} />
                    {fubPersonId && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground">Quick Send</Label>
                        <Switch checked={quickSendModeText} onCheckedChange={setQuickSendModeText} className="h-4 w-7" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {smsVariants.map((variant, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-md border p-3 cursor-pointer transition-colors',
                        selectedSmsIndex === i ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/30',
                      )}
                      onClick={() => setSelectedSmsIndex(i)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px]">{variant.label}</Badge>
                        <Button size="sm" variant="ghost" className="text-xs h-6" onClick={(e) => { e.stopPropagation(); handleCopy(variant.text, `sms-${i}`); }}>
                          {copiedField === `sms-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <p className="text-sm">{variant.text}</p>
                    </div>
                  ))}
                </div>

                {/* Send / Log actions */}
                <div className="border-t border-border pt-3 space-y-2">
                  {textSent ? (
                    <div className="flex items-center gap-2 text-sm text-opportunity">
                      <Check className="h-4 w-4" />
                      <span>Text sent via FUB</span>
                    </div>
                  ) : fubPersonId ? (
                    <Button
                      size="sm"
                      className="text-xs w-full"
                      disabled={sending}
                      onClick={async () => {
                        const msg = smsVariants[selectedSmsIndex]?.text;
                        if (!msg) return;
                        if (quickSendModeText) {
                          const ok = await sendText(msg);
                          if (ok) { setTextSent(true); onLogTouch?.(context.entityType, context.entityId, context.entityName, 'text', `Sent via FUB: ${msg}`); }
                        } else {
                          // Draft+confirm: show confirmation
                          if (confirm(`Send this text via FUB?\n\n"${msg}"`)) {
                            const ok = await sendText(msg);
                            if (ok) { setTextSent(true); onLogTouch?.(context.entityType, context.entityId, context.entityName, 'text', `Sent via FUB: ${msg}`); }
                          }
                        }
                      }}
                    >
                      {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                      {quickSendModeText ? 'Send Text Now' : 'Review & Send via FUB'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs w-full"
                      onClick={() => {
                        onLogTouch?.(context.entityType, context.entityId, context.entityName, 'text', smsVariants[selectedSmsIndex]?.text || 'Sent text');
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Log Text Sent
                    </Button>
                  )}
                  {fubPersonId && !textSent && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      {quickSendModeText ? 'Sends immediately through FUB' : 'You\'ll preview before sending'}
                    </p>
                  )}
                </div>

                {/* Text History from FUB */}
                {(() => {
                  const textHistory = recentFubActivities.filter(a => a.activity_type === 'text' || a.activity_type === 'sms' || a.activity_type === 'textMessage');
                  if (textHistory.length === 0) return null;
                  return (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Text History (FUB)</p>
                      <div className="space-y-1 max-h-[240px] overflow-y-auto">
                        {textHistory.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md border border-border bg-muted/30">
                            <div className="shrink-0 mt-0.5">
                              {a.direction === 'inbound' ? (
                                <ArrowDownLeft className="h-3 w-3 text-primary" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium capitalize">{a.direction || 'outbound'}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(a.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  {' '}
                                  {new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {a.body_preview && <p className="text-muted-foreground mt-0.5">{a.body_preview}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── EMAIL TAB ────────────────────────────────────────── */}
            {activeTab === 'email' && (
              <div className="space-y-4">
                {renderOpenerSection('email', 'Insert into email', (text) => {
                  // Prepend opener to email body
                  const current = editedEmail ?? emailBody;
                  setEditedEmail(text + '\n\n' + current);
                  toast({ description: 'Opener inserted at top of email' });
                })}
                {/* Tone & Length selectors */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tone</Label>
                    <Select value={emailTone} onValueChange={(v) => { setEmailTone(v as EmailTone); setEditedEmail(null); }}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">Direct</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Length</Label>
                    <Select value={emailLength} onValueChange={(v) => { setEmailLength(v as EmailLength); setEditedEmail(null); }}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="detailed">Detailed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Subject */}
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Subject</span>
                    <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => handleCopy(draft.email.subject, 'subject')}>
                      {copiedField === 'subject' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-sm font-medium mt-1">{draft.email.subject}</p>
                </div>

                {/* Body */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Body</span>
                  <TemplatesButton onClick={() => setShowEmailTemplates(true)} />
                </div>
                <Textarea
                  value={displayEmail}
                  onChange={(e) => setEditedEmail(e.target.value)}
                  className="min-h-[200px] text-sm"
                />

                {/* Actions */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => handleCopy(`Subject: ${draft.email.subject}\n\n${displayEmail}`, 'fullemail')}>
                      {copiedField === 'fullemail' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {copiedField === 'fullemail' ? 'Copied' : 'Copy Email'}
                    </Button>
                  </div>
                  {emailSent ? (
                    <div className="flex items-center gap-2 text-sm text-opportunity">
                      <Check className="h-4 w-4" />
                      <span>Email sent via FUB</span>
                    </div>
                  ) : fubPersonId ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">Quick Send</Label>
                        <Switch checked={quickSendModeEmail} onCheckedChange={setQuickSendModeEmail} className="h-4 w-7" />
                      </div>
                      <Button
                        size="sm"
                        className="text-xs w-full"
                        disabled={sending}
                        onClick={async () => {
                          const subj = draft.email.subject;
                          const bod = displayEmail;
                          if (quickSendModeEmail) {
                            const ok = await sendEmail(subj, bod);
                            if (ok) { setEmailSent(true); onLogTouch?.(context.entityType, context.entityId, context.entityName, 'email', `Sent via FUB: ${subj}`); }
                          } else {
                            if (confirm(`Send this email via FUB?\n\nSubject: ${subj}\n\n${bod.slice(0, 200)}...`)) {
                              const ok = await sendEmail(subj, bod);
                              if (ok) { setEmailSent(true); onLogTouch?.(context.entityType, context.entityId, context.entityName, 'email', `Sent via FUB: ${subj}`); }
                            }
                          }
                        }}
                      >
                        {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                        {quickSendModeEmail ? 'Send Email Now' : 'Review & Send via FUB'}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs w-full" onClick={() => {
                      onLogTouch?.(context.entityType, context.entityId, context.entityName, 'email', 'Sent email');
                    }}>
                      Log Email Sent
                    </Button>
                  )}
                </div>

                {/* Write Listing */}
                <div className="border-t border-border pt-3 space-y-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs w-full"
                    onClick={() => setShowListingWriter(v => !v)}
                  >
                    ✍ Write Listing
                    {showListingWriter ? <ChevronUp className="h-3.5 w-3.5 ml-1.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-1.5" />}
                  </Button>

                  {showListingWriter && (
                    <div className="space-y-2.5 p-3 rounded-lg border border-border bg-muted/30">
                      <Input
                        placeholder="Property Address"
                        value={listingAddress}
                        onChange={e => setListingAddress(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Beds</Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="3"
                            value={listingBeds}
                            onChange={e => setListingBeds(e.target.value)}
                            className="h-8 text-xs mt-0.5"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Baths</Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="2"
                            value={listingBaths}
                            onChange={e => setListingBaths(e.target.value)}
                            className="h-8 text-xs mt-0.5"
                          />
                        </div>
                      </div>
                      <Textarea
                        placeholder="Key features (comma-separated)"
                        value={listingFeatures}
                        onChange={e => setListingFeatures(e.target.value)}
                        className="min-h-[60px] text-xs"
                      />
                      <Button
                        size="sm"
                        className="text-xs w-full"
                        disabled={listingLoading || !listingAddress.trim()}
                        onClick={async () => {
                          setListingLoading(true);
                          setListingResult('');
                          try {
                            const { data, error } = await supabase.functions.invoke('listing-writer', {
                              body: {
                                bedrooms: listingBeds || '3',
                                bathrooms: listingBaths || '2',
                                sqft: 'N/A',
                                price: 'N/A',
                                propertyType: 'Residential',
                                neighborhood: listingAddress,
                                features: listingFeatures,
                                style: 'Professional',
                              },
                            });
                            if (error) throw error;
                            const mls = data?.mls || data?.social || JSON.stringify(data);
                            setListingResult(mls);
                          } catch (err: any) {
                            toast({ title: 'Could not generate listing', description: err?.message || 'Try again', variant: 'destructive' });
                          } finally {
                            setListingLoading(false);
                          }
                        }}
                      >
                        {listingLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                        Generate
                      </Button>

                      {listingResult && (
                        <div className="space-y-1.5">
                          <Textarea
                            readOnly
                            value={listingResult}
                            className="min-h-[120px] text-xs bg-card"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs w-full"
                            onClick={() => {
                              navigator.clipboard.writeText(listingResult);
                              toast({ title: 'Copied listing to clipboard' });
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1.5" /> Copy Listing
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Email History from FUB */}
                {(() => {
                  const emailHistory = recentFubActivities.filter(a => a.activity_type === 'email');
                  if (emailHistory.length === 0) return null;
                  return (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Email History (FUB)</p>
                      <div className="space-y-1 max-h-[240px] overflow-y-auto">
                        {emailHistory.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md border border-border bg-muted/30">
                            <div className="shrink-0 mt-0.5">
                              {a.direction === 'inbound' ? (
                                <ArrowDownLeft className="h-3 w-3 text-primary" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium truncate max-w-[180px]">{a.subject || 'No subject'}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {new Date(a.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              {a.body_preview && <p className="text-muted-foreground mt-0.5 line-clamp-2">{a.body_preview}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TASK TAB ─────────────────────────────────────────── */}
            {activeTab === 'task' && (
              <div className="space-y-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Create Follow-Up Task</p>

                {taskCreated ? (
                  <div className="flex items-center gap-2 text-sm text-opportunity p-4 rounded-md border border-opportunity/20 bg-opportunity/5">
                    <Check className="h-4 w-4" />
                    <span>Task created: {taskTitle}</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Task Title</Label>
                        <Input
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder={`Follow up with ${context.entityName}`}
                          className="text-sm mt-1"
                        />
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-1">
                          <Label className="text-xs">Type</Label>
                          <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="follow_up">Follow-Up</SelectItem>
                              <SelectItem value="call">Call</SelectItem>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="showing">Showing</SelectItem>
                              <SelectItem value="closing">Closing</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Due Date</Label>
                          <Input
                            type="date"
                            value={taskDueAt ? new Date(taskDueAt).toISOString().split('T')[0] : new Date(smartDueDate).toISOString().split('T')[0]}
                            onChange={(e) => setTaskDueAt(new Date(e.target.value).toISOString())}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      Linked to: <span className="font-medium">{context.entityName}</span> ({context.entityType})
                    </div>

                    <Button size="sm" className="w-full text-xs" onClick={handleCreateTask} disabled={!taskTitle.trim()}>
                      <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                      Create Task
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ── NOTES TAB ────────────────────────────────────────── */}
            {activeTab === 'notes' && (
              <div className="space-y-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quick Note</p>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={`Add a note about ${context.entityName}...`}
                  className="min-h-[80px] text-sm"
                />
                <Button size="sm" className="w-full text-xs" onClick={(e) => handleLogNote(e)} disabled={!noteText.trim()}>
                  <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                  Save Note
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
                              await supabase.from('activity_events').update({ note: '[deleted]' }).eq('id', n.id);
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
                    {savedNotes.length >= 15 && (
                      <p className="text-[10px] text-muted-foreground text-center py-1">
                        Showing 15 most recent notes
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIVITY TAB ──────────────────────────────────────── */}
            {activeTab === 'activity' && (
              <ActivityTimeline entityId={entity?.id || ''} entityType={entityType} entity={entity} />
            )}
          </div>
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
    <MessageTemplatesSheet
      open={showTextTemplates}
      onClose={() => setShowTextTemplates(false)}
      leadFirstName={context?.entityName?.split(' ')[0] || ''}
      onSelect={(body) => {
        navigator.clipboard.writeText(body);
        toast({ description: 'Template copied to clipboard' });
      }}
    />
    <MessageTemplatesSheet
      open={showEmailTemplates}
      onClose={() => setShowEmailTemplates(false)}
      leadFirstName={context?.entityName?.split(' ')[0] || ''}
      onSelect={(body) => {
        setEditedEmail(body);
        toast({ description: 'Template inserted into email' });
      }}
    />
  </>
  );
}

// ── Activity Timeline ────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  type: string;
  content: string;
  timestamp: string;
}

const TIMELINE_DOT_COLORS: Record<string, string> = {
  call: 'bg-green-500',
  text: 'bg-green-500',
  email: 'bg-green-500',
  touch: 'bg-green-500',
  showing: 'bg-green-500',
  note: 'bg-blue-500',
  task: 'bg-indigo-500',
  follow_up: 'bg-indigo-500',
  closing: 'bg-indigo-500',
  risk: 'bg-amber-500',
  contact: 'bg-primary',
};

const TIMELINE_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
  note: StickyNote,
  task: ListTodo,
  follow_up: ListTodo,
  showing: CalendarDays,
  closing: Check,
  risk: AlertTriangle,
  contact: Phone,
};

function ActivityTimeline({ entityId, entityType, entity }: { entityId: string; entityType: string; entity: any }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('activity_events')
          .select('id, touch_type, note, created_at')
          .eq('entity_id', entityId)
          .not('note', 'eq', '[deleted]')
          .order('created_at', { ascending: false })
          .limit(50);

        if (cancelled) return;

        const mapped: TimelineEvent[] = (data || []).map((row: any) => ({
          id: row.id,
          type: row.touch_type || 'touch',
          content: row.note || `${(row.touch_type || 'touch').replace('_', ' ')} logged`,
          timestamp: row.created_at,
        }));

        // Add last-contacted synthetic entry from entity
        const lastTouched = entity?.lastTouchedAt || entity?.last_touched_at;
        if (lastTouched) {
          const alreadyCovered = mapped.some(e => {
            const diff = Math.abs(new Date(e.timestamp).getTime() - new Date(lastTouched).getTime());
            return diff < 60_000;
          });
          if (!alreadyCovered) {
            mapped.push({
              id: 'last-contact',
              type: 'contact',
              content: 'Last contacted',
              timestamp: lastTouched,
            });
          }
        }

        // Sort descending
        mapped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEvents(mapped);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityId, entity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground ml-2">Loading activity…</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 flex flex-col items-center gap-2 text-center">
        <History className="h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">No activity recorded yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Activity Timeline</p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-3">
          {events.map((evt) => {
            const Icon = TIMELINE_ICONS[evt.type] || Activity;
            const dotColor = TIMELINE_DOT_COLORS[evt.type] || 'bg-muted-foreground';
            return (
              <div key={evt.id} className="flex items-start gap-3 relative">
                <div className={`w-[15px] h-[15px] rounded-full ${dotColor} flex items-center justify-center shrink-0 z-10 ring-2 ring-background`}>
                  <Icon className="h-2.5 w-2.5 text-white" />
                </div>
                <div className="flex-1 min-w-0 pt-px">
                  <p className="text-xs text-foreground leading-tight">{evt.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(evt.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
