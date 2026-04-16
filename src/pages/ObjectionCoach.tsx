import { useState } from 'react';
import { ArrowLeft, Shield, Wrench, TrendingUp, HeartCrack, BarChart, DollarSign, Users, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const SCENARIOS = [
  { id: 'inspection', icon: Wrench, title: 'Low Inspection Request', desc: 'Buyer wants $30K in repairs. Seller is pushing back.' },
  { id: 'overprice', icon: TrendingUp, title: 'Seller Wants to Overprice', desc: 'They insist on listing $50K above market.' },
  { id: 'coldfeet', icon: HeartCrack, title: 'Buyer Got Cold Feet', desc: 'They want to cancel after going under contract.' },
  { id: 'appraisal', icon: BarChart, title: 'Low Appraisal', desc: 'Home appraised $25K below purchase price.' },
  { id: 'commission', icon: DollarSign, title: 'Commission Objection', desc: 'Seller says your fee is too high.' },
  { id: 'multioffer', icon: Users, title: 'Multiple Offer Situation', desc: 'Your buyer needs to win in a competitive offer.' },
] as const;

interface CoachingResult {
  mindset: string;
  whatToSay: string;
  mistake: string;
}

function parseResponse(text: string): CoachingResult {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const sayLines = Array.isArray(parsed.sayThis) ? parsed.sayThis : [];
    return {
      mindset: parsed.mindset || '',
      whatToSay: sayLines.join('\n\n'),
      mistake: parsed.mistake || '',
    };
  } catch {
    // Fallback for non-JSON responses
    const lower = text.toLowerCase();
    const mindsetIdx = Math.max(lower.indexOf('mindset'), 0);
    const mistakeIdx = lower.lastIndexOf('mistake');
    return {
      mindset: text.slice(mindsetIdx, text.length / 3).replace(/^mindset:?\s*/i, '').trim(),
      whatToSay: text.slice(text.length / 3, mistakeIdx > 0 ? mistakeIdx : (text.length * 2) / 3).trim(),
      mistake: mistakeIdx > 0 ? text.slice(mistakeIdx).replace(/^.*mistake:?\s*/i, '').trim() : '',
    };
  }
}

export default function ObjectionCoach() {
  const [selected, setSelected] = useState<typeof SCENARIOS[number] | null>(null);
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: 'You are a real estate coach. Be direct and tactical. Give concise, actionable coaching.',
          messages: [{ role: 'user', content: `Scenario: ${selected.title}\nAgent situation: ${situation.trim() || 'Not specified'}\n\nReturn ONLY a JSON object, no markdown:\n{"mindset":"1-2 sentences on right mindset","sayThis":["exact word for word line 1","exact word for word line 2","exact word for word line 3"],"mistake":"the #1 mistake to avoid"}` }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || '';
      setResult(parseResponse(text));
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to generate coaching script. Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = `🧠 Mindset\n${result.mindset}\n\n💬 What to Say\n${result.whatToSay}\n\n⚠️ Biggest Mistake\n${result.mistake}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    setSelected(null);
    setResult(null);
    setSituation('');
  };

  // Coaching detail view
  if (selected) {
    const Icon = selected.icon;
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to scenarios
        </button>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">{selected.title}</h2>
        </div>

        {!result && (
          <div className="space-y-4">
            <Textarea
              placeholder={`Describe your specific situation (optional)\ne.g. "Seller received a $40K repair request after inspection on a $520K home..."`}
              value={situation}
              onChange={e => setSituation(e.target.value)}
              className="min-h-[100px] bg-card border-border"
            />
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating your script…
                </span>
              ) : (
                'Get My Coaching Script →'
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {[
              { emoji: '🧠', label: 'Mindset', content: result.mindset },
              { emoji: '💬', label: 'What to Say', content: result.whatToSay, isList: true },
              { emoji: '⚠️', label: 'Biggest Mistake', content: result.mistake },
            ].map(s => (
              <Card key={s.label} className="border-amber-500/30 bg-card p-4">
                <h3 className="text-sm font-semibold text-amber-400 mb-2">{s.emoji} {s.label}</h3>
                {(s as any).isList ? (
                  <ul className="space-y-2">
                    {s.content.split('\n\n').filter(Boolean).map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-amber-400 font-bold shrink-0 mt-0.5">{i + 1}.</span>
                        <span className="leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{s.content}</p>
                )}
              </Card>
            ))}

            <div className="flex gap-3">
              <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Script'}
              </Button>
              <Button onClick={handleBack} variant="ghost" className="flex-1">
                Try Another Scenario
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Grid view
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Objection Coach</h1>
          <p className="text-xs text-muted-foreground">AI-powered scripts for every tough conversation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SCENARIOS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="text-left p-4 rounded-xl bg-card border border-border border-l-4 border-l-primary/60 hover:border-l-primary hover:bg-accent/30 transition-all"
            >
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
