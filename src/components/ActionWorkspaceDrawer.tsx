import { useState, useMemo, useCallback, useEffect } from 'react';
import { Phone, MessageSquare, Mail, ListTodo, StickyNote, Copy, Check, Shield, Target, X, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import { LocalIntelBriefPanel } from '@/components/LocalIntelBriefPanel';
import { ClientPreferencesPanel } from '@/components/ClientPreferencesPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
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
  type FollowUpSuggestion,
  type ConfidenceLevel,
} from '@/lib/executionEngine';

// ── Types ────────────────────────────────────────────────────────────

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

function generateSmsVariants(name: string, context: string): { label: string; text: string }[] {
  return [
    { label: 'Short', text: `Hi ${name}, checking in — do you have a moment to connect today?` },
    { label: 'Medium', text: `Hi ${name}, I wanted to follow up on our conversation. ${context ? context + ' ' : ''}Are you available for a quick chat?` },
    { label: 'Friendly', text: `Hey ${name}! Hope you're doing well. I've been thinking about your situation and had a few ideas. Would love to chat when you have a moment 😊` },
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

  // Email tab state
  const [emailTone, setEmailTone] = useState<EmailTone>('professional');
  const [emailLength, setEmailLength] = useState<EmailLength>('medium');
  const [editedEmail, setEditedEmail] = useState<string | null>(null);

  // Task tab state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('follow_up');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);

  // Notes tab state
  const [noteText, setNoteText] = useState('');
  const [savedNotes, setSavedNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);

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

  // Derived data
  const context = useMemo((): ExecutionContext | null => {
    if (!entity) return null;
    return buildExecutionContext(entity, entityType, moneyResult, oppResult, tasks);
  }, [entity, entityType, moneyResult, oppResult, tasks]);

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
    return generateSmsVariants(context.entityName, contextStr);
  }, [context]);

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

  if (!entity || !context || !draft) return null;

  const tabs: { key: WorkspaceTab; label: string; icon: typeof Phone; subtitle: string }[] = [
    { key: 'intel', label: 'Intel', icon: Zap, subtitle: 'Data brief' },
    { key: 'prefs', label: 'Preferences', icon: Target, subtitle: 'Client wants' },
    { key: 'call', label: 'Call', icon: Phone, subtitle: 'Script & outcomes' },
    { key: 'text', label: 'Text', icon: MessageSquare, subtitle: 'SMS templates' },
    { key: 'email', label: 'Email', icon: Mail, subtitle: 'Draft & send' },
    { key: 'task', label: 'Task', icon: ListTodo, subtitle: 'Create follow-up' },
    { key: 'notes', label: 'Notes', icon: StickyNote, subtitle: 'Quick note' },
  ];

  const displayEmail = editedEmail ?? emailBody;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <PanelErrorBoundary>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base leading-tight">{context.entityName}</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">{entityContextLabel}</SheetDescription>
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
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{context.confidence.reason}</p>
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
              <LocalIntelBriefPanel
                entityId={context.entityId}
                entityType={context.entityType}
                entityName={context.entityName}
                entity={entity}
              />
            )}

            {/* ── PREFERENCES TAB ─────────────────────────────────── */}
            {activeTab === 'prefs' && entity && (
              <ClientPreferencesPanel
                entityId={context.entityId}
                entityType={context.entityType}
                entityName={context.entityName}
                entity={entity}
              />
            )}

            {/* ── CALL TAB ─────────────────────────────────────────── */}
            {activeTab === 'call' && callBrief && (
              <div className="space-y-4">
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested Messages</p>
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

                {/* Schedule follow-up toggle */}
                <div className="border-t border-border pt-3">
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
                </div>
              </div>
            )}

            {/* ── EMAIL TAB ────────────────────────────────────────── */}
            {activeTab === 'email' && (
              <div className="space-y-4">
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
                <Textarea
                  value={displayEmail}
                  onChange={(e) => setEditedEmail(e.target.value)}
                  className="min-h-[200px] text-sm"
                />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => handleCopy(`Subject: ${draft.email.subject}\n\n${displayEmail}`, 'fullemail')}>
                    {copiedField === 'fullemail' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copiedField === 'fullemail' ? 'Copied' : 'Copy Email'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                    onLogTouch?.(context.entityType, context.entityId, context.entityName, 'email', 'Sent email');
                  }}>
                    Log Email Sent
                  </Button>
                </div>
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
                      <div key={n.id} className="text-xs p-2.5 rounded-md border border-border bg-muted/30">
                        <p className="text-foreground whitespace-pre-wrap">{n.note}</p>
                        <p className="text-muted-foreground text-[10px] mt-1">
                          {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
