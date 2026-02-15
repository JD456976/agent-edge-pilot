import { useState, useMemo } from 'react';
import { MessageSquare, Mail, Phone, Copy, Check, Edit3, ChevronDown, ChevronUp, Shield, Target } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PanelErrorBoundary } from '@/components/ErrorBoundary';
import type { Deal, Lead, Task } from '@/types';
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

interface Props {
  open: boolean;
  onClose: () => void;
  entity: Deal | Lead | null;
  entityType: 'deal' | 'lead';
  moneyResult?: MoneyModelResult | null;
  oppResult?: OpportunityHeatResult | null;
  tasks?: Task[];
  onCreateFollowUp?: (title: string, dueAt: string, entityId: string, entityType: 'deal' | 'lead') => void;
  onLogTouch?: (entityType: 'deal' | 'lead', entityId: string, entityTitle: string) => void;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-opportunity/10 text-opportunity border-opportunity/20',
  MEDIUM: 'bg-warning/10 text-warning border-warning/20',
  LOW: 'bg-muted text-muted-foreground border-border',
};

type DraftTab = 'sms' | 'email' | 'call';

export function ActionComposerDrawer({ open, onClose, entity, entityType, moneyResult, oppResult, tasks, onCreateFollowUp, onLogTouch }: Props) {
  const [activeTab, setActiveTab] = useState<DraftTab>('sms');
  const [editedSms, setEditedSms] = useState<string | null>(null);
  const [editedEmail, setEditedEmail] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showObjections, setShowObjections] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpCreated, setFollowUpCreated] = useState(false);

  const context = useMemo((): ExecutionContext | null => {
    if (!entity) return null;
    return buildExecutionContext(entity, entityType, moneyResult, oppResult, tasks);
  }, [entity, entityType, moneyResult, oppResult, tasks]);

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

  const followUp = useMemo((): FollowUpSuggestion | null => {
    if (!entity) return null;
    return generateFollowUp(entity, entityType);
  }, [entity, entityType]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const handleCreateFollowUp = () => {
    if (!followUp || !context || followUpCreated) return;
    onCreateFollowUp?.(followUp.title, followUp.dueAt, context.entityId, context.entityType);
    setFollowUpCreated(true);
  };

  const handleLogTouch = () => {
    if (!context) return;
    onLogTouch?.(context.entityType, context.entityId, context.entityName);
  };

  if (!entity || !context || !draft) return null;

  const smsText = editedSms ?? draft.sms;
  const emailText = editedEmail ?? draft.email.body;

  const tabs: { key: DraftTab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'sms', label: 'SMS', icon: MessageSquare },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'call', label: 'Call Brief', icon: Phone },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <PanelErrorBoundary>
          <SheetHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-base">Ready to Send</SheetTitle>
                <SheetDescription className="text-xs">{context.entityName}</SheetDescription>
              </div>
              <div className="flex items-center gap-1.5">
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
          </SheetHeader>

          {/* Confidence & Context */}
          <div className="rounded-md border border-border bg-background/50 p-3 mb-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Execution Confidence: {context.confidence.level}</span>
            </div>
            <p className="text-xs text-muted-foreground">{context.confidence.reason}</p>
            {context.confidence.upside > 0 && (
              <p className="text-xs text-muted-foreground">Potential upside: {formatCurrency(context.confidence.upside)}</p>
            )}
          </div>

          {/* Tab selector */}
          <div className="flex gap-1 mb-4">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors',
                    activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-3 w-3" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* SMS Tab */}
          {activeTab === 'sms' && (
            <div className="space-y-3">
              <Textarea
                value={smsText}
                onChange={(e) => setEditedSms(e.target.value)}
                className="min-h-[100px] text-sm"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCopy(smsText, 'sms')}>
                  {copiedField === 'sms' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedField === 'sms' ? 'Copied' : 'Copy SMS'}
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={handleLogTouch}>
                  Log Touch
                </Button>
              </div>
            </div>
          )}

          {/* Email Tab */}
          {activeTab === 'email' && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Subject:</span>
                  <button onClick={() => handleCopy(draft.email.subject, 'subject')} className="text-xs text-primary hover:text-primary/80 transition-colors">
                    {copiedField === 'subject' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm font-medium">{draft.email.subject}</p>
              </div>
              <Textarea
                value={emailText}
                onChange={(e) => setEditedEmail(e.target.value)}
                className="min-h-[180px] text-sm"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCopy(`Subject: ${draft.email.subject}\n\n${emailText}`, 'email')}>
                  {copiedField === 'email' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedField === 'email' ? 'Copied' : 'Copy Email'}
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={handleLogTouch}>
                  Log Touch
                </Button>
              </div>
            </div>
          )}

          {/* Call Brief Tab */}
          {activeTab === 'call' && callBrief && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-background/50 p-3 space-y-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Who</p>
                  <p className="text-sm font-medium">{callBrief.who}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
                  <p className="text-xs">{callBrief.status}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Why Now</p>
                  <p className="text-xs">{callBrief.whyNow}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Key Risks</p>
                  <ul className="space-y-1 mt-1">
                    {callBrief.keyRisks.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Shield className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Desired Outcome</p>
                  <p className="text-xs font-medium">{callBrief.desiredOutcome}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conversation Flow</p>
                  <ol className="space-y-1 mt-1">
                    {callBrief.conversationFlow.map((step, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Talking points copy */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => handleCopy(draft.callPoints.join('\n'), 'callpoints')}
              >
                {copiedField === 'callpoints' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copiedField === 'callpoints' ? 'Copied' : 'Copy Talking Points'}
              </Button>
            </div>
          )}

          {/* Objection Anticipation */}
          {objections.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <button onClick={() => setShowObjections(!showObjections)} className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showObjections ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Likely Objections ({objections.length})
              </button>
              {showObjections && (
                <div className="space-y-2.5 mt-3">
                  {objections.map((obj, i) => (
                    <div key={i} className="rounded-md border border-border bg-background/50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{obj.objection}</p>
                        <Badge variant="outline" className="text-[10px]">{obj.confidence}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{obj.response}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Follow-Up Generator */}
          {followUp && (
            <div className="mt-4 border-t border-border pt-4">
              <button onClick={() => setShowFollowUp(!showFollowUp)} className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showFollowUp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Next Follow-Up
              </button>
              {showFollowUp && (
                <div className="rounded-md border border-border bg-background/50 p-3 mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{followUp.contactType.replace('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{followUp.timing}</span>
                  </div>
                  <p className="text-sm font-medium">{followUp.title}</p>
                  <p className="text-xs text-muted-foreground">{followUp.draft}</p>
                  <Button
                    size="sm"
                    variant={followUpCreated ? 'outline' : 'default'}
                    className="text-xs"
                    disabled={followUpCreated}
                    onClick={handleCreateFollowUp}
                  >
                    {followUpCreated ? (
                      <><Check className="h-3 w-3 mr-1" /> Created</>
                    ) : (
                      'Create Follow-Up Task'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </PanelErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
