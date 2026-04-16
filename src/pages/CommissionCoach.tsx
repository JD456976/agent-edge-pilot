import { useState } from 'react';
import { Shield, Copy, Check, Send, Loader2, Sparkles, Target, MessageCircle, User, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────

interface BuildCaseResult {
  script: string;
  valuePoints: string[];
  objections: { question: string; rebuttal: string }[];
}

interface CritiqueResult {
  score: number;
  weak: string;
  stronger: string;
}

// ─── Copy Button ─────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2.5 text-xs gap-1.5 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: 'Copied to clipboard' });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

// ─── Section 1: Pre-Listing Prep ─────────────────────────────────────

function PreListingPrep() {
  const [agentName, setAgentName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [listingPrice, setListingPrice] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [yearsAgent, setYearsAgent] = useState('');
  const [homesSold, setHomesSold] = useState('');
  const [marketing, setMarketing] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BuildCaseResult | null>(null);

  const build = async () => {
    if (!agentName.trim()) {
      toast({ title: 'Enter your name', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: 'You are a real estate commission negotiation coach. Help agents confidently justify their commission. Always respond with valid JSON only, no markdown.',
          messages: [{ role: 'user', content: `Build a commission justification script for:\nAgent: ${agentName}${yearsAgent ? `, ${yearsAgent} years experience` : ''}${homesSold ? `, ${homesSold} homes sold` : ''}\nProperty: ${propertyAddress || 'not specified'} at ${listingPrice || 'list price TBD'}\nNeighborhood: ${neighborhood || 'not specified'}\nMarketing: ${marketing || 'standard marketing'}\n\nReturn ONLY this JSON:\n{"justification":"2-3 sentence compelling justification script for the agent to say out loud","objection_responses":["response to price objection","response to 'I found a cheaper agent'","response to 'what do I get for that?'"],"closing_line":"One powerful closing line"}` }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      setResult(JSON.parse(clean));
    } catch {
      toast({ title: 'Error building your case', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[13px]">Your Name</Label>
          <Input value={agentName} onChange={e => setAgentName(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="Jane Smith" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[13px]">Property Address</Label>
          <Input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="123 Maple St, Walpole MA" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Listing Price</Label>
          <Input value={listingPrice} onChange={e => setListingPrice(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="$525,000" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Neighborhood</Label>
          <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="Walpole" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Years as Agent</Label>
          <Input value={yearsAgent} onChange={e => setYearsAgent(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Homes Sold</Label>
          <Input value={homesSold} onChange={e => setHomesSold(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="120" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[13px]">Unique Marketing Capabilities</Label>
          <Input value={marketing} onChange={e => setMarketing(e.target.value)} className="h-11 min-h-[44px] text-sm" placeholder="Drone video, 3D Matterport tours, targeted social ads…" />
        </div>
      </div>

      <Button onClick={build} disabled={loading} className="w-full h-11 gap-2 text-sm font-semibold">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
        {loading ? 'Building Your Case…' : 'Build My Case'}
      </Button>

      {result && (
        <div className="space-y-5 animate-fade-in">
          {/* Justification Script */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Commission Justification Script
              </p>
              <CopyBtn text={result.script} />
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.script}</p>
          </div>

          {/* Value Points */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data-Backed Value Points</p>
            <ul className="space-y-2">
              {result.valuePoints.map((vp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="h-5 w-5 rounded-full bg-opportunity/10 text-opportunity flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">{i + 1}</span>
                  <span className="leading-relaxed">{vp}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Objection Rebuttals */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objection Rebuttals</p>
            {result.objections.map((obj, i) => (
              <ObjectionRebuttalCard key={i} objection={obj} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectionRebuttalCard({ objection }: { objection: { question: string; rebuttal: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors min-h-[52px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageCircle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-medium">{objection.question}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-relaxed">{objection.rebuttal}</p>
            <CopyBtn text={objection.rebuttal} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Objection Simulator ──────────────────────────────────

const SIMULATOR_PROMPTS = [
  "I want to interview 3 agents and go with whoever charges the least.",
  "I found a 1% agent online — why would I pay you 3%?",
  "My neighbor's agent only charged 2%. Can you match that?",
  "The market is hot right now. Homes sell themselves — I don't need marketing.",
  "I've sold two homes FSBO before. Why do I need you?",
];

function ObjectionSimulator() {
  const [currentPrompt, setCurrentPrompt] = useState(SIMULATOR_PROMPTS[0]);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);

  const submit = async () => {
    if (!response.trim()) {
      toast({ title: 'Type your response first', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setCritique(null);
    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: 'You are a real estate sales coach evaluating agent responses to seller objections. Be direct and constructive. Always respond with valid JSON only, no markdown.',
          messages: [{ role: 'user', content: `Seller objection: "${currentPrompt}"\nAgent response: "${response.trim()}"\n\nScore and critique this response. Return ONLY this JSON:\n{"score":7,"what_worked":"what was effective","what_to_improve":"specific improvement","better_response":"a stronger version of their response in 1-2 sentences"}` }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      setCritique(JSON.parse(clean));
    } catch {
      toast({ title: 'Error getting critique', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const nextPrompt = () => {
    const idx = SIMULATOR_PROMPTS.indexOf(currentPrompt);
    setCurrentPrompt(SIMULATOR_PROMPTS[(idx + 1) % SIMULATOR_PROMPTS.length]);
    setResponse('');
    setCritique(null);
  };

  const scoreColor = (s: number) => s >= 8 ? 'text-opportunity' : s >= 5 ? 'text-warning' : 'text-destructive';
  const scoreBg = (s: number) => s >= 8 ? 'bg-opportunity/10 border-opportunity/20' : s >= 5 ? 'bg-warning/10 border-warning/20' : 'bg-destructive/10 border-destructive/20';

  return (
    <div className="space-y-4">
      {/* Seller prompt bubble */}
      <div className="flex gap-2.5 items-start">
        <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-destructive" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 max-w-[85%]">
          <p className="text-sm font-medium leading-relaxed">"{currentPrompt}"</p>
        </div>
      </div>

      {/* Agent response input */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Your response:</Label>
        <textarea
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder="Type how you'd respond to this seller…"
          className="w-full min-h-[120px] rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          disabled={loading}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={loading || !response.trim()} className="flex-1 h-11 gap-2 text-sm font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? 'Analyzing…' : 'Submit for Critique'}
        </Button>
        <Button variant="outline" onClick={nextPrompt} className="h-11 text-sm px-4">
          Next Objection
        </Button>
      </div>

      {/* Critique result */}
      {critique && (
        <div className="space-y-4 animate-fade-in">
          {/* Score */}
          <div className={cn('rounded-xl border p-4 flex items-center gap-4', scoreBg(critique.score))}>
            <div className={cn('text-3xl font-black', scoreColor(critique.score))}>{critique.score}/10</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Score</p>
              <p className="text-sm">
                {critique.score >= 8 ? 'Excellent — this would win the listing.' : critique.score >= 5 ? 'Decent, but there\'s room to improve.' : 'Needs work — the seller would keep shopping.'}
              </p>
            </div>
          </div>

          {/* What was weak */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold text-destructive uppercase tracking-wider">What Was Weak</p>
            <p className="text-sm leading-relaxed">{critique.weak}</p>
          </div>

          {/* Stronger version */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Stronger Version
              </p>
              <CopyBtn text={critique.stronger} />
            </div>
            <p className="text-sm leading-relaxed">{critique.stronger}</p>
          </div>
        </div>
      )}

      {/* Prompt selector */}
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Practice other objections:</p>
        <div className="flex flex-wrap gap-1.5">
          {SIMULATOR_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => { setCurrentPrompt(p); setResponse(''); setCritique(null); }}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors min-h-[32px]',
                currentPrompt === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {p.length > 40 ? p.slice(0, 40) + '…' : p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function CommissionCoach() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Commission Coach</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Build your case, practice your pitch, and win every listing appointment.
        </p>
      </div>

      {/* Section 1: Pre-Listing Prep */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Pre-Listing Prep</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Enter your details and property info. We'll generate a personalized commission justification script, data-backed value points, and rebuttals for common objections.
        </p>
        <PreListingPrep />
      </section>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Section 2: Objection Simulator */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Objection Simulator</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Practice handling real seller objections. Type your response, get scored 1–10, and learn what a stronger answer looks like.
        </p>
        <ObjectionSimulator />
      </section>
    </div>
  );
}
