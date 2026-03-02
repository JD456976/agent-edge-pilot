import { useState, useMemo } from 'react';
import { Send, Home, Clock, CheckCircle2, X, MessageSquare, Mail } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addDays, addHours, setHours, setMinutes } from 'date-fns';
import type { Lead } from '@/types';

interface PostShowingComposerProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  propertyAddress?: string;
  agentName?: string;
  onSendText?: (text: string) => Promise<void>;
  onSendEmail?: (subject: string, body: string) => Promise<void>;
  onCreateFollowUpTask?: (title: string, dueAt: string) => void;
  sending?: boolean;
}

function buildShowingDrafts(
  lead: Lead,
  propertyAddress?: string,
  agentName?: string,
): { sms: string; email: { subject: string; body: string } } {
  const firstName = lead.name.split(' ')[0];
  const addr = propertyAddress
    ? propertyAddress.replace(/([a-z])([A-Z])/g, '$1, $2').trim()
    : 'the property';

  const isHot = lead.leadTemperature === 'hot';
  const tags = lead.statusTags || [];

  const isPreApproved = tags.some(t => /pre.approv/i.test(t));
  const hasUrgency = tags.some(t => /lease|expire|school|must move|urgent/i.test(t));
  const budgetTag = tags.find(t => /\$[\d,k]+/i.test(t));

  const smsBody = isHot
    ? `Hi ${firstName}! Really enjoyed showing you ${addr} today. What were your first impressions? Happy to answer any questions 🏡`
    : `Hi ${firstName}, thanks for coming out to see ${addr} today! Let me know if you have any questions or want to take another look.`;

  const nextStepLine = isPreApproved
    ? `Since you're pre-approved, if ${addr} feels right we can move quickly on an offer.`
    : hasUrgency
    ? `Given your timeline, I want to make sure we don't lose momentum — happy to talk through next steps whenever you're ready.`
    : `There's no pressure — take some time to think it over and let me know if you'd like to see anything else.`;

  const budgetLine = budgetTag
    ? `At ${budgetTag}, this property is ${isHot ? 'well within range' : 'in the ballpark'}.`
    : '';

  const signOff = agentName || 'Jason';

  const emailBody = [
    `Hi ${firstName},`,
    '',
    `Thank you for taking the time to see ${addr} today. I really enjoyed walking through it with you.`,
    '',
    budgetLine,
    nextStepLine,
    '',
    `Feel free to reply here or give me a call if you have any questions — I'm always happy to talk through what you saw and what might be a better fit.`,
    '',
    'Best,',
    signOff,
  ].filter(l => l !== undefined).join('\n');

  return {
    sms: smsBody,
    email: {
      subject: `Great seeing you today — ${addr}`,
      body: emailBody,
    },
  };
}

function getFollowUpDue(lead: Lead): { label: string; date: Date } {
  const tomorrow9am = setMinutes(setHours(addDays(new Date(), 1), 9), 0);
  if (lead.leadTemperature === 'hot') return { label: 'Tomorrow morning', date: tomorrow9am };
  if (lead.leadTemperature === 'warm') return { label: 'In 2 days', date: addDays(tomorrow9am, 1) };
  return { label: 'In 3 days', date: addDays(tomorrow9am, 2) };
}

export function PostShowingComposer({
  open,
  onClose,
  lead,
  propertyAddress,
  agentName,
  onSendText,
  onSendEmail,
  onCreateFollowUpTask,
}: PostShowingComposerProps) {
  const drafts = useMemo(() => buildShowingDrafts(lead, propertyAddress, agentName), [lead, propertyAddress, agentName]);

  const [tab, setTab] = useState<'text' | 'email'>(() => lead.leadTemperature === 'hot' ? 'text' : 'email');
  const [smsBody, setSmsBody] = useState(drafts.sms);
  const [emailSubject, setEmailSubject] = useState(drafts.email.subject);
  const [emailBody, setEmailBody] = useState(drafts.email.body);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<'text' | 'email' | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);

  const followUp = useMemo(() => getFollowUpDue(lead), [lead]);
  const formattedAddr = propertyAddress ? propertyAddress.replace(/([a-z])([A-Z])/g, '$1, $2').trim() : null;

  const handleSendText = async () => {
    if (!onSendText) return;
    setSending(true);
    try {
      await onSendText(smsBody);
      setSent('text');
    } catch { /* handled upstream */ }
    finally { setSending(false); }
  };

  const handleSendEmail = async () => {
    if (!onSendEmail) return;
    setSending(true);
    try {
      await onSendEmail(emailSubject, emailBody);
      setSent('email');
    } catch { /* handled upstream */ }
    finally { setSending(false); }
  };

  const handleCreateTask = () => {
    if (!onCreateFollowUpTask) return;
    onCreateFollowUpTask(`Follow up after showing with ${lead.name}`, followUp.date.toISOString());
    setTaskCreated(true);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <SheetTitle className="text-base">Follow-Up Ready</SheetTitle>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Based on today's showing — review and send</p>
        </SheetHeader>

        {/* Property chip */}
        {formattedAddr && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 px-1">
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span>{formattedAddr}</span>
          </div>
        )}

        {sent ? (
          /* Success state */
          <div className="py-8 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">
              {sent === 'text' ? 'Text sent' : 'Email sent'} via FUB
            </p>
            {!taskCreated ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">Add a follow-up task?</p>
                <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleCreateTask}>
                  <Clock className="h-3 w-3" /> {followUp.label}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">✓ Follow-up task created</p>
            )}
            <Button size="sm" className="mt-2" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tab toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
              <button
                onClick={() => setTab('text')}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                  tab === 'text' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MessageSquare className="h-3 w-3" /> Text Message
              </button>
              <button
                onClick={() => setTab('email')}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                  tab === 'email' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Mail className="h-3 w-3" /> Email
              </button>
            </div>

            {/* Text tab */}
            {tab === 'text' && (
              <div className="space-y-2">
                <Textarea
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className={cn('text-[10px]', smsBody.length > 160 ? 'text-amber-500' : 'text-muted-foreground')}>
                    {smsBody.length}/160
                  </span>
                  <Button size="sm" className="gap-1.5" onClick={handleSendText} disabled={sending || !smsBody.trim()}>
                    <Send className="h-3 w-3" /> {sending ? 'Sending…' : 'Send Text'}
                  </Button>
                </div>
              </div>
            )}

            {/* Email tab */}
            {tab === 'email' && (
              <div className="space-y-2">
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                  className="text-sm"
                />
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="text-sm resize-none"
                />
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={handleSendEmail} disabled={sending || !emailBody.trim()}>
                    <Send className="h-3 w-3" /> {sending ? 'Sending…' : 'Send Email'}
                  </Button>
                </div>
              </div>
            )}

            {/* Schedule follow-up */}
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Schedule a follow-up</span>
                <span className="text-foreground font-medium">· {followUp.label}</span>
              </div>
              {!taskCreated ? (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleCreateTask}>
                  Create Task
                </Button>
              ) : (
                <span className="text-xs text-green-500 font-medium">✓ Created</span>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
