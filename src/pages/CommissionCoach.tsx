import { useState, useCallback } from 'react';
import { Shield, MessageCircle, Calculator, Sparkles, FileText, Copy, Check, ChevronDown, ChevronUp, Send, User, Bot, Loader2, DollarSign, TrendingUp, Home, Clock, BarChart3, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// ─── Objection Handler ──────────────────────────────────────────────

interface Objection {
  id: string;
  question: string;
  category: string;
  scripts: { tone: string; response: string }[];
}

const OBJECTIONS: Objection[] = [
  {
    id: 'why-3',
    question: '"Why should I pay you 3%?"',
    category: 'Rate',
    scripts: [
      { tone: 'Confident', response: 'Because my marketing, negotiation, and transaction management consistently net my sellers 5-12% more than they\'d get on their own — far exceeding my fee. Last year, my average sale price was $18,000 above asking. That 3% isn\'t a cost — it\'s an investment with a measurable return.' },
      { tone: 'Empathetic', response: 'I totally understand that question — it\'s a lot of money. Here\'s how I think about it: my job is to make sure you walk away with the most money possible, in the least amount of time, with the fewest headaches. The 3% covers professional photography, staging consultation, MLS syndication to 500+ sites, open houses, negotiation, and full transaction management. Most of my sellers tell me the peace of mind alone was worth it.' },
      { tone: 'Data-driven', response: 'Great question. NAR data shows that FSBO homes sell for a median of $310,000 versus $405,000 for agent-assisted sales — that\'s a 31% difference. My commission is 3%. Even if we cut that gap in half, you\'re still coming out significantly ahead. I\'d love to show you exactly how the numbers work for your specific property.' },
    ],
  },
  {
    id: 'discount',
    question: '"Can you do it for 2%?"',
    category: 'Rate',
    scripts: [
      { tone: 'Confident', response: 'I appreciate you asking. Here\'s the thing — when you reduce my commission, you\'re reducing my ability to market your home at the highest level. That means fewer professional photos, less advertising spend, and potentially fewer showings. My full-service approach is designed to maximize your net proceeds, and that\'s what I\'d love to deliver for you.' },
      { tone: 'Empathetic', response: 'I hear you, and I know every dollar matters. But let me share something: agents who discount their commission often cut corners on marketing — and that can cost you tens of thousands in final sale price. I invest about $3,000-5,000 of my own money marketing each listing. If I cut my rate, I\'d have to cut that investment, and your home deserves better.' },
      { tone: 'Data-driven', response: 'Let\'s look at the math together. On a $500K home, the difference between 3% and 2% is $5,000. But my marketing strategy — professional staging, photography, targeted digital ads, and strategic pricing — typically yields 3-5% above market average. That\'s $15,000-$25,000 more in your pocket. The ROI on that extra 1% is roughly 3-5x.' },
    ],
  },
  {
    id: 'zillow',
    question: '"I can just list on Zillow myself"',
    category: 'FSBO',
    scripts: [
      { tone: 'Confident', response: 'You absolutely can, and I respect that entrepreneurial spirit. But here\'s what Zillow won\'t do: price your home using hyperlocal comps, stage it for maximum appeal, negotiate inspection repairs, manage appraisal challenges, coordinate with the title company, or protect you from legal liability. Selling a home is a 150+ step process, and one misstep can cost you thousands or kill the deal entirely.' },
      { tone: 'Empathetic', response: 'I get it — it seems simple, right? List it, wait for offers. But what I\'ve seen happen with FSBO sellers breaks my heart: they underprice by $30K because they didn\'t know about a recent comp, or they accept a lowball offer because they don\'t know how to create competitive bidding. I\'d love to at least show you what your home is really worth before you decide.' },
      { tone: 'Data-driven', response: 'According to NAR\'s 2024 data, only 7% of homes sell FSBO, and they sell for a median of 23% less than agent-assisted sales. The average FSBO home sits on market 3 weeks longer. Time on market directly correlates with price reductions. I\'d rather help you sell faster and for more money.' },
    ],
  },
  {
    id: 'flat-fee',
    question: '"What about flat-fee MLS services?"',
    category: 'Competition',
    scripts: [
      { tone: 'Confident', response: 'Flat-fee services get your home on the MLS — and that\'s about it. There\'s no pricing strategy, no professional photography, no showing coordination, no offer negotiation, no transaction management. When something goes wrong (and it usually does), you\'re on your own. My clients get a full-service experience backed by [X] years of local expertise and a track record of results.' },
      { tone: 'Empathetic', response: 'Those services can be tempting — I understand the appeal of saving money upfront. But I\'ve helped several clients who tried flat-fee first and came to me after their home sat on market for months with no offers. The listing is only 10% of the job. The other 90% — marketing, negotiation, problem-solving — is where the real value is created.' },
      { tone: 'Data-driven', response: 'Here\'s what flat-fee services don\'t tell you: homes listed with full-service agents receive 2.5x more showings on average, sell 35% faster, and net 8-13% more for the seller. When you factor in the time cost of managing everything yourself plus the lower sale price, the "savings" often become a net loss.' },
    ],
  },
  {
    id: 'buyer-agent',
    question: '"The buyer\'s agent takes half anyway"',
    category: 'Rate',
    scripts: [
      { tone: 'Confident', response: 'Since the NAR settlement, buyer agent compensation is negotiable and separate from your listing agreement. We\'ll discuss what, if any, concession to offer buyers — and I\'ll help you make a strategic decision based on market conditions. In competitive markets, offering buyer agent compensation can increase your buyer pool and drive up your sale price. It\'s a lever we pull strategically, not an automatic cost.' },
      { tone: 'Data-driven', response: 'Post-settlement data shows that listings offering buyer agent compensation still sell for 3-5% more on average because they attract more qualified buyers. The key is being strategic about it — and that\'s exactly what I help you with. We\'ll analyze current market conditions and set the right number to maximize your net proceeds.' },
    ],
  },
];

function ObjectionCard({ objection }: { objection: Objection }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast({ title: 'Copied to clipboard', description: 'Script copied — paste it anywhere.' });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors min-h-[56px]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <MessageCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{objection.question}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px]">{objection.category}</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {objection.scripts.map((script, idx) => (
            <div key={idx} className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">{script.tone}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => handleCopy(script.response, idx)}
                >
                  {copiedIdx === idx ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedIdx === idx ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{script.response}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectionHandler() {
  const [filter, setFilter] = useState<string>('all');
  const categories = ['all', ...Array.from(new Set(OBJECTIONS.map(o => o.category)))];
  const filtered = filter === 'all' ? OBJECTIONS : OBJECTIONS.filter(o => o.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors min-h-[36px]',
              filter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            )}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map(obj => <ObjectionCard key={obj.id} objection={obj} />)}
      </div>
    </div>
  );
}

// ─── Value Calculator ────────────────────────────────────────────────

function ValueCalculator() {
  const [homePrice, setHomePrice] = useState(500000);
  const [commissionRate, setCommissionRate] = useState(3);
  const [marketingSpend, setMarketingSpend] = useState(4000);
  const [avgDaysOnMarket, setAvgDaysOnMarket] = useState(21);
  const [marketAvgDays, setMarketAvgDays] = useState(45);
  const [agentPremium, setAgentPremium] = useState(5);

  const commission = Math.round(homePrice * (commissionRate / 100));
  const netGain = Math.round(homePrice * (agentPremium / 100));
  const roi = commission > 0 ? ((netGain / commission) * 100).toFixed(0) : '0';
  const daysSaved = marketAvgDays - avgDaysOnMarket;
  const carryingSaved = Math.round((daysSaved / 30) * (homePrice * 0.005)); // ~0.5% monthly carrying costs

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Home Price</Label>
          <Input
            type="number"
            value={homePrice}
            onChange={e => setHomePrice(Number(e.target.value) || 0)}
            className="h-9 text-sm"
            placeholder="500000"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Your Rate (%)</Label>
          <Input
            type="number"
            step="0.5"
            value={commissionRate}
            onChange={e => setCommissionRate(Number(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Marketing Spend ($)</Label>
          <Input
            type="number"
            value={marketingSpend}
            onChange={e => setMarketingSpend(Number(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Your Avg DOM</Label>
          <Input
            type="number"
            value={avgDaysOnMarket}
            onChange={e => setAvgDaysOnMarket(Number(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Market Avg DOM</Label>
          <Input
            type="number"
            value={marketAvgDays}
            onChange={e => setMarketAvgDays(Number(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Agent Price Premium (%)</Label>
          <Input
            type="number"
            step="0.5"
            value={agentPremium}
            onChange={e => setAgentPremium(Number(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
          <DollarSign className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-xl font-bold text-primary">${commission.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Your Commission</p>
        </div>
        <div className="rounded-xl bg-opportunity/10 border border-opportunity/20 p-4 text-center">
          <TrendingUp className="h-5 w-5 text-opportunity mx-auto mb-1" />
          <p className="text-xl font-bold text-opportunity">${netGain.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Extra Value to Seller</p>
        </div>
        <div className="rounded-xl bg-accent border border-border p-4 text-center">
          <BarChart3 className="h-5 w-5 text-foreground mx-auto mb-1" />
          <p className="text-xl font-bold">{roi}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Seller ROI on Commission</p>
        </div>
        <div className="rounded-xl bg-accent border border-border p-4 text-center">
          <Clock className="h-5 w-5 text-foreground mx-auto mb-1" />
          <p className="text-xl font-bold">{daysSaved > 0 ? daysSaved : 0} days</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Faster Than Average</p>
        </div>
      </div>

      {/* Pitch summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Value Pitch</p>
        <p className="text-sm leading-relaxed">
          "For a ${homePrice.toLocaleString()} home, my {commissionRate}% commission is ${commission.toLocaleString()}. 
          But my clients typically sell for {agentPremium}% above market — that's <strong>${netGain.toLocaleString()} more</strong> in your pocket. 
          I also sell {daysSaved > 0 ? `${daysSaved} days faster` : 'at market pace'}, saving you roughly ${carryingSaved.toLocaleString()} in carrying costs. 
          Your ROI on my fee is <strong>{roi}%</strong>. I invest ${marketingSpend.toLocaleString()} of my own money marketing your home."
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1"
          onClick={() => {
            const text = `For a $${homePrice.toLocaleString()} home, my ${commissionRate}% commission is $${commission.toLocaleString()}. But my clients typically sell for ${agentPremium}% above market — that's $${netGain.toLocaleString()} more in your pocket. I also sell ${daysSaved > 0 ? `${daysSaved} days faster` : 'at market pace'}, saving you roughly $${carryingSaved.toLocaleString()} in carrying costs. Your ROI on my fee is ${roi}%. I invest $${marketingSpend.toLocaleString()} of my own money marketing your home.`;
            navigator.clipboard.writeText(text);
            toast({ title: 'Value pitch copied!' });
          }}
        >
          <Copy className="h-3 w-3" /> Copy Pitch
        </Button>
      </div>
    </div>
  );
}

// ─── AI Roleplay Trainer ─────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'seller';
  content: string;
}

function AIRoleplayTrainer() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [started, setStarted] = useState(false);

  const startSession = async () => {
    setStarted(true);
    setMessages([]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('commission-coach-roleplay', {
        body: { action: 'start', difficulty, history: [] },
      });
      if (error) throw error;
      setMessages([{ role: 'seller', content: data.reply }]);
    } catch {
      toast({ title: 'Error starting session', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    const newHistory: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newHistory);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('commission-coach-roleplay', {
        body: { action: 'reply', difficulty, history: newHistory },
      });
      if (error) throw error;
      setMessages(prev => [...prev, { role: 'seller', content: data.reply }]);
    } catch {
      toast({ title: 'Error getting response', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!started) {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">AI Commission Roleplay</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Practice handling commission objections with an AI seller. Choose your difficulty and sharpen your skills.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          {(['easy', 'medium', 'hard'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-medium transition-colors min-h-[40px] capitalize',
                difficulty === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <Button onClick={startSession} className="gap-2">
          <Sparkles className="h-4 w-4" /> Start Practice Session
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex items-center justify-between mb-3">
        <Badge variant="outline" className="text-[10px] capitalize">{difficulty} difficulty</Badge>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setStarted(false); setMessages([]); }}>
          New Session
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'seller' && (
              <div className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-destructive" />
              </div>
            )}
            <div className={cn(
              'max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
              msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
            )}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 items-center">
            <div className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div className="bg-muted rounded-xl px-3.5 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Respond to the seller..."
          className="h-10 text-sm"
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="h-10 w-10 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Presentation Builder ────────────────────────────────────────────

function PresentationBuilder() {
  const [agentName, setAgentName] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [avgSalePrice, setAvgSalePrice] = useState('');
  const [marketingHighlights, setMarketingHighlights] = useState('');
  const [generating, setGenerating] = useState(false);
  const [presentation, setPresentation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!agentName.trim()) {
      toast({ title: 'Enter your name', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('commission-coach-roleplay', {
        body: {
          action: 'presentation',
          agentName,
          yearsExp,
          avgSalePrice,
          marketingHighlights,
        },
      });
      if (error) throw error;
      setPresentation(data.reply);
    } catch {
      toast({ title: 'Error generating presentation', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Your Name</Label>
          <Input value={agentName} onChange={e => setAgentName(e.target.value)} className="h-9 text-sm" placeholder="Jane Smith" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Years Experience</Label>
          <Input value={yearsExp} onChange={e => setYearsExp(e.target.value)} className="h-9 text-sm" placeholder="8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Avg Sale Price</Label>
          <Input value={avgSalePrice} onChange={e => setAvgSalePrice(e.target.value)} className="h-9 text-sm" placeholder="$475,000" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Marketing Highlights</Label>
          <Input value={marketingHighlights} onChange={e => setMarketingHighlights(e.target.value)} className="h-9 text-sm" placeholder="Drone video, social ads..." />
        </div>
      </div>
      <Button onClick={generate} disabled={generating} className="w-full gap-2">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {generating ? 'Generating...' : 'Generate Commission Justification'}
      </Button>

      {presentation && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Commission Justification</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => {
                navigator.clipboard.writeText(presentation);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                toast({ title: 'Copied to clipboard!' });
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{presentation}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function CommissionCoach() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Commission Coach</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Defend your value, handle objections, and win every listing appointment.
        </p>
      </div>

      <Tabs defaultValue="objections" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-auto p-1">
          <TabsTrigger value="objections" className="text-xs py-2 gap-1 data-[state=active]:text-primary">
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Objections</span>
          </TabsTrigger>
          <TabsTrigger value="calculator" className="text-xs py-2 gap-1 data-[state=active]:text-primary">
            <Calculator className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Calculator</span>
          </TabsTrigger>
          <TabsTrigger value="roleplay" className="text-xs py-2 gap-1 data-[state=active]:text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Roleplay</span>
          </TabsTrigger>
          <TabsTrigger value="presentation" className="text-xs py-2 gap-1 data-[state=active]:text-primary">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pitch</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="objections">
          <ObjectionHandler />
        </TabsContent>
        <TabsContent value="calculator">
          <ValueCalculator />
        </TabsContent>
        <TabsContent value="roleplay">
          <AIRoleplayTrainer />
        </TabsContent>
        <TabsContent value="presentation">
          <PresentationBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
