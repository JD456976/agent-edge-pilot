import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Phone, Mail, MessageSquare, Check, SkipForward, Pause, Trash2, Play, Search, CalendarDays, UserPlus, X, Sparkles, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

/* ── Template data ─────────────────────────────────────────── */
type StepType = 'call' | 'text' | 'email';
interface SequenceStep { day: number; type: StepType; message?: string }
interface SequenceTemplate { id: string; name: string; steps: SequenceStep[] }

const TEMPLATES: SequenceTemplate[] = [
  {
    id: 'new-internet', name: 'New Internet Lead', steps: [
      { day: 1, type: 'call' },
      { day: 1, type: 'text', message: 'Hi [name], saw you were looking at homes in [area]. I have some great options — when\'s a good time to connect?' },
      { day: 3, type: 'call' },
      { day: 5, type: 'email' },
      { day: 10, type: 'text' },
      { day: 21, type: 'email' },
      { day: 30, type: 'call' },
    ],
  },
  {
    id: 'hot-sphere', name: 'Hot Sphere Contact', steps: [
      { day: 1, type: 'call' },
      { day: 3, type: 'text' },
      { day: 7, type: 'email' },
      { day: 14, type: 'call' },
      { day: 30, type: 'email' },
    ],
  },
  {
    id: 'open-house', name: 'Open House Follow-Up', steps: [
      { day: 1, type: 'text', message: 'Great meeting you at [address] today!' },
      { day: 2, type: 'email', message: 'Listings matching their criteria' },
      { day: 5, type: 'call' },
      { day: 10, type: 'email' },
      { day: 21, type: 'text' },
      { day: 45, type: 'email' },
    ],
  },
  {
    id: 'past-client', name: 'Past Client Nurture', steps: [
      { day: 1, type: 'call' },
      { day: 30, type: 'email', message: 'Market update' },
      { day: 90, type: 'text', message: 'Checking in' },
      { day: 180, type: 'email', message: 'Anniversary / market update' },
    ],
  },
  {
    id: 'price-reduction', name: 'Price Reduction Follow-Up', steps: [
      { day: 1, type: 'call' },
      { day: 3, type: 'email' },
      { day: 7, type: 'text' },
      { day: 14, type: 'call' },
    ],
  },
];

/* ── Enrollment type ───────────────────────────────────────── */
interface Enrollment {
  id: string;
  leadId: string;
  leadName: string;
  sequenceId: string;
  startDate: string; // ISO
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  paused: boolean;
}

const LS_KEY = 'dealPilot_enrollments';

function loadEnrollments(): Enrollment[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveEnrollments(e: Enrollment[]) { localStorage.setItem(LS_KEY, JSON.stringify(e)); }

/* ── Helpers ───────────────────────────────────────────────── */
const StepIcon = ({ type, size = 14 }: { type: StepType; size?: number }) => {
  if (type === 'call') return <Phone size={size} />;
  if (type === 'text') return <MessageSquare size={size} />;
  return <Mail size={size} />;
};

const stepLabel = (type: StepType) => type === 'call' ? 'Call' : type === 'text' ? 'Send text' : 'Send email';

function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function heatBadge(temp: string | null | undefined) {
  if (!temp) return null;
  const colors: Record<string, string> = { hot: 'bg-urgent/15 text-urgent', warm: 'bg-warning/15 text-warning', cool: 'bg-muted text-muted-foreground' };
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', colors[temp] || colors.cool)}>{temp}</span>;
}

const lastDay = (steps: SequenceStep[]) => Math.max(...steps.map(s => s.day));

/* ── Main Component ────────────────────────────────────────── */
export default function Sequences() {
  const { leads } = useData();
  const [enrollments, setEnrollments] = useState<Enrollment[]>(loadEnrollments);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollTemplateId, setEnrollTemplateId] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiExpanded, setAiExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const generateAiMessage = useCallback(async (key: string, lead: any, step: SequenceStep, seqName: string) => {
    if (aiMessages[key]) {
      setAiExpanded(p => ({ ...p, [key]: !p[key] }));
      return;
    }
    setAiLoading(p => ({ ...p, [key]: true }));
    setAiExpanded(p => ({ ...p, [key]: true }));
    const name = lead?.name?.split(' ')[0] || 'them';
    const temp = lead?.leadTemperature || 'unknown';
    const source = lead?.source || '';
    const tags = (lead?.statusTags || []).join(', ');
    const daysAgo = lead?.lastTouchedAt
      ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
      : null;
    const contactNote = daysAgo !== null ? `last contacted ${daysAgo} days ago` : 'never contacted';
    const actionType = step.type === 'call' ? 'call script opening line' : step.type === 'text' ? 'text message' : 'email (subject + 3-sentence body)';
    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 250,
          system: `You are a real estate sales coach writing outreach for an agent. Write one ${actionType} that is personal, natural, and non-salesy. No asterisks, no markdown, no bullet points. Just the message text, ready to copy and use.`,
          messages: [{
            role: 'user',
            content: `Sequence: ${seqName}\nStep: Day ${step.day} — ${step.type}\nLead: ${name} | temp: ${temp} | source: ${source}${tags ? ' | ' + tags : ''} | ${contactNote}\n\nWrite the ${actionType}.`
          }]
        })
      });
      const result = await resp.json();
      if (result?.type === 'error') throw new Error('API error');
      const text = (result?.content?.[0]?.text || '').trim();
      setAiMessages(p => ({ ...p, [key]: text }));
    } catch {
      setAiMessages(p => ({ ...p, [key]: 'Could not generate message. Try again.' }));
    } finally {
      setAiLoading(p => ({ ...p, [key]: false }));
    }
  }, [aiMessages]);

  const copyMessage = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  }, []);

  useEffect(() => { saveEnrollments(enrollments); }, [enrollments]);

  const todayStr = new Date().toISOString().split('T')[0];

  // Compute due items
  const dueItems = useMemo(() => {
    const items: { enrollment: Enrollment; step: SequenceStep; stepIndex: number; dueDate: string; overdueDays: number }[] = [];
    enrollments.forEach(en => {
      if (en.paused) return;
      const tpl = TEMPLATES.find(t => t.id === en.sequenceId);
      if (!tpl) return;
      tpl.steps.forEach((step, idx) => {
        if (en.completedSteps.includes(idx) || en.skippedSteps.includes(idx)) return;
        const dueDate = new Date(new Date(en.startDate).getTime() + step.day * 86400000).toISOString().split('T')[0];
        if (dueDate <= todayStr) {
          items.push({ enrollment: en, step, stepIndex: idx, dueDate, overdueDays: daysBetween(dueDate, todayStr) });
        }
      });
    });
    items.sort((a, b) => b.overdueDays - a.overdueDays);
    return items;
  }, [enrollments, todayStr]);

  const markDone = useCallback((enId: string, stepIdx: number) => {
    setEnrollments(prev => prev.map(e => e.id === enId ? { ...e, completedSteps: [...e.completedSteps, stepIdx], currentStep: Math.max(e.currentStep, stepIdx + 1) } : e));
    toast({ title: 'Step completed ✓', duration: 2000 });
  }, []);

  const skipStep = useCallback((enId: string, stepIdx: number) => {
    setEnrollments(prev => prev.map(e => e.id === enId ? { ...e, skippedSteps: [...e.skippedSteps, stepIdx], currentStep: Math.max(e.currentStep, stepIdx + 1) } : e));
  }, []);

  const togglePause = useCallback((enId: string) => {
    setEnrollments(prev => prev.map(e => e.id === enId ? { ...e, paused: !e.paused } : e));
  }, []);

  const removeEnrollment = useCallback((enId: string) => {
    setEnrollments(prev => prev.filter(e => e.id !== enId));
    toast({ title: 'Lead removed from sequence', duration: 2000 });
  }, []);

  const enrollLead = useCallback((leadId: string, leadName: string, seqId: string) => {
    const en: Enrollment = {
      id: crypto.randomUUID(),
      leadId, leadName, sequenceId: seqId,
      startDate: todayStr,
      currentStep: 0, completedSteps: [], skippedSteps: [], paused: false,
    };
    setEnrollments(prev => [...prev, en]);
    toast({ title: `${leadName} enrolled`, description: TEMPLATES.find(t => t.id === seqId)?.name, duration: 3000 });
    setEnrollModalOpen(false);
    setEnrollTemplateId(null);
  }, [todayStr]);

  const activeEnrollments = enrollments.filter(e => {
    const tpl = TEMPLATES.find(t => t.id === e.sequenceId);
    if (!tpl) return false;
    return e.completedSteps.length + e.skippedSteps.length < tpl.steps.length;
  });

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-4">
        <h1 className="text-xl font-bold text-foreground">Follow-Up Sequences</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Automated touchpoint plans for every lead stage</p>
      </div>

      <Tabs defaultValue="due" className="w-full">
        <TabsList className="w-full bg-muted/50 mb-4">
          <TabsTrigger value="due" className="flex-1 text-xs">Due Today {dueItems.length > 0 && <span className="ml-1.5 bg-urgent/20 text-urgent text-[10px] px-1.5 rounded-full">{dueItems.length}</span>}</TabsTrigger>
          <TabsTrigger value="active" className="flex-1 text-xs">Active{activeEnrollments.length > 0 && <span className="ml-1.5 bg-primary/20 text-primary text-[10px] px-1.5 rounded-full">{activeEnrollments.length}</span>}</TabsTrigger>
          <TabsTrigger value="templates" className="flex-1 text-xs">Templates</TabsTrigger>
        </TabsList>

        {/* ── Due Today ──────────────────────────────────── */}
        <TabsContent value="due">
          {dueItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 rounded-full bg-opportunity/15 flex items-center justify-center mx-auto mb-3"><Check className="text-opportunity" size={20} /></div>
              <p className="text-sm font-medium text-foreground">No touchpoints due today</p>
              <p className="text-xs text-muted-foreground mt-1">Great work — you're caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dueItems.map(({ enrollment, step, stepIndex, overdueDays }) => {
                const tpl = TEMPLATES.find(t => t.id === enrollment.sequenceId);
                const lead = leads.find(l => l.id === enrollment.leadId);
                return (
                  <div key={`${enrollment.id}-${stepIndex}`} className="bg-card border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{enrollment.leadName}</span>
                        {lead && heatBadge(lead.leadTemperature)}
                        {overdueDays > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue {overdueDays}d</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{tpl?.name}</p>
                    <div className="flex items-center gap-2 text-xs text-foreground mb-2">
                      <StepIcon type={step.type} size={12} />
                      <span>Day {step.day} — {stepLabel(step.type)}</span>
                    </div>
                    {step.message && <p className="text-xs text-muted-foreground italic mb-2 line-clamp-2">"{step.message}"</p>}
                    {/* AI Message */}
                    {aiExpanded[`${enrollment.id}-${stepIndex}`] && (
                      <div className="mt-2 rounded-lg bg-muted/40 p-3 space-y-2">
                        {aiLoading[`${enrollment.id}-${stepIndex}`] ? (
                          <div className="space-y-1.5 animate-pulse">
                            <div className="h-3 bg-muted rounded w-full" />
                            <div className="h-3 bg-muted rounded w-4/5" />
                            <div className="h-3 bg-muted rounded w-3/5" />
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{aiMessages[`${enrollment.id}-${stepIndex}`]}</p>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => copyMessage(`${enrollment.id}-${stepIndex}`, aiMessages[`${enrollment.id}-${stepIndex}`] || '')}>
                              {copied[`${enrollment.id}-${stepIndex}`] ? <><Check size={10} /> Copied!</> : <><Copy size={10} /> Copy</>}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => generateAiMessage(`${enrollment.id}-${stepIndex}`, lead, step, tpl?.name || '')}>
                        <Sparkles size={11} className="text-primary" />
                        {aiExpanded[`${enrollment.id}-${stepIndex}`] ? (aiLoading[`${enrollment.id}-${stepIndex}`] ? 'Writing…' : 'Hide') : 'Write Message'}
                      </Button>
                      <Button size="sm" className="h-7 text-xs bg-opportunity hover:bg-opportunity/90 text-white" onClick={() => markDone(enrollment.id, stepIndex)}>
                        <Check size={12} className="mr-1" /> Done
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => skipStep(enrollment.id, stepIndex)}>
                        <SkipForward size={12} className="mr-1" /> Skip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Active Sequences ───────────────────────────── */}
        <TabsContent value="active">
          {activeEnrollments.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">No active sequences yet</p>
              <p className="text-xs text-muted-foreground mt-1">Enroll a lead from the Templates tab</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeEnrollments.map(en => {
                const tpl = TEMPLATES.find(t => t.id === en.sequenceId);
                if (!tpl) return null;
                const done = en.completedSteps.length + en.skippedSteps.length;
                const total = tpl.steps.length;
                const pct = Math.round((done / total) * 100);
                // Next undone step
                const nextIdx = tpl.steps.findIndex((_, i) => !en.completedSteps.includes(i) && !en.skippedSteps.includes(i));
                const nextStep = nextIdx >= 0 ? tpl.steps[nextIdx] : null;
                const nextDueDate = nextStep ? new Date(new Date(en.startDate).getTime() + nextStep.day * 86400000) : null;
                const daysUntil = nextDueDate ? daysBetween(todayStr, nextDueDate.toISOString().split('T')[0]) : 0;

                return (
                  <div key={en.id} className={cn('bg-card border border-border rounded-xl p-3', en.paused && 'opacity-60')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-foreground">{en.leadName}</span>
                      {en.paused && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{tpl.name}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Step {done} of {total}</span>
                    </div>
                    {nextStep && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Next: Day {nextStep.day} — {stepLabel(nextStep.type)} {daysUntil > 0 ? `in ${daysUntil}d` : daysUntil === 0 ? '(today)' : `(${Math.abs(daysUntil)}d overdue)`}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground" onClick={() => togglePause(en.id)}>
                        {en.paused ? <><Play size={10} className="mr-1" /> Resume</> : <><Pause size={10} className="mr-1" /> Pause</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-urgent" onClick={() => removeEnrollment(en.id)}>
                        <Trash2 size={10} className="mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Templates ──────────────────────────────────── */}
        <TabsContent value="templates">
          <div className="space-y-3">
            {TEMPLATES.map(tpl => (
              <div key={tpl.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{tpl.name}</h3>
                  <span className="text-[10px] text-muted-foreground">{tpl.steps.length} steps · {lastDay(tpl.steps)} days</span>
                </div>
                {/* Timeline dots */}
                <div className="flex items-center gap-1 mb-3">
                  {tpl.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-[10px]',
                        s.type === 'call' ? 'bg-primary/15 text-primary' : s.type === 'text' ? 'bg-opportunity/15 text-opportunity' : 'bg-warning/15 text-warning'
                      )}>
                        <StepIcon type={s.type} size={10} />
                      </div>
                      {i < tpl.steps.length - 1 && <div className="w-3 h-px bg-border" />}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs bg-primary hover:bg-primary/90" onClick={() => { setEnrollTemplateId(tpl.id); setEnrollModalOpen(true); }}>
                    <UserPlus size={12} className="mr-1" /> Enroll a Lead
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Enroll Modal ─────────────────────────────────── */}
      {enrollModalOpen && (
        <EnrollSheet
          leads={leads}
          templates={TEMPLATES}
          preselectedTemplateId={enrollTemplateId}
          existingLeadIds={enrollments.map(e => e.leadId)}
          onEnroll={enrollLead}
          onClose={() => { setEnrollModalOpen(false); setEnrollTemplateId(null); }}
        />
      )}
    </div>
  );
}

/* ── Enroll Bottom Sheet ──────────────────────────────────── */
function EnrollSheet({ leads, templates, preselectedTemplateId, existingLeadIds, onEnroll, onClose }: {
  leads: any[];
  templates: SequenceTemplate[];
  preselectedTemplateId: string | null;
  existingLeadIds: string[];
  onEnroll: (leadId: string, leadName: string, seqId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<{ id: string; name: string } | null>(null);
  const [selectedSeq, setSelectedSeq] = useState(preselectedTemplateId || templates[0].id);

  const filtered = leads.filter(l => !existingLeadIds.includes(l.id) && l.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card border-t border-border rounded-t-2xl p-5 pb-safe animate-slide-up" style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">Enroll a Lead</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        {/* Lead search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-muted/50" autoFocus />
        </div>

        {!selectedLead ? (
          <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No matching leads</p>}
            {filtered.map(l => (
              <button key={l.id} onClick={() => setSelectedLead({ id: l.id, name: l.name })} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-left transition-colors">
                <span className="text-sm text-foreground">{l.name}</span>
                {heatBadge(l.leadTemperature)}
                <span className="text-[10px] text-muted-foreground ml-auto">{l.source}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-sm font-medium text-foreground">{selectedLead.name}</span>
              <button onClick={() => setSelectedLead(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
          </div>
        )}

        {/* Sequence picker */}
        <p className="text-xs text-muted-foreground mb-2">Sequence</p>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {templates.map(t => (
            <button key={t.id} onClick={() => setSelectedSeq(t.id)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                selectedSeq === t.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent'
              )}>
              {t.name}
            </button>
          ))}
        </div>

        <Button className="w-full bg-primary hover:bg-primary/90" disabled={!selectedLead} onClick={() => selectedLead && onEnroll(selectedLead.id, selectedLead.name, selectedSeq)}>
          Start Sequence
        </Button>
      </div>
    </div>
  );
}
