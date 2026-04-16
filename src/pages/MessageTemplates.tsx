import { useState, useCallback } from 'react';
import { Copy, Check, Search, Plus, Trash2, MessageSquare, Mail, Phone, X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type Channel = 'text' | 'email' | 'call';
type Category = 'new-lead' | 'follow-up' | 'open-house' | 'milestone' | 'nurture' | 'custom';

interface Template {
  id: string;
  title: string;
  body: string;
  channel: Channel;
  category: Category;
  isCustom?: boolean;
}

const STORAGE_KEY = 'dealPilot_messageTemplates';

const BUILT_IN: Template[] = [
  {
    id: 'nl-1',
    title: 'New Internet Lead — First Touch',
    channel: 'text',
    category: 'new-lead',
    body: `Hi {{name}}, this is {{agent}} with {{brokerage}}. I saw you were looking at homes in the area — happy to answer any questions or set up a personalized search. What's most important to you in your next home?`,
  },
  {
    id: 'nl-2',
    title: 'New Lead — Email Intro',
    channel: 'email',
    category: 'new-lead',
    body: `Hi {{name}},\n\nThanks for reaching out! I'm {{agent}} and I specialize in {{area}}.\n\nI'd love to learn more about what you're looking for. Are you flexible on timing, or is there a specific move date driving your search?\n\nI have a few listings that might be a great fit — happy to send them over or schedule a quick call.\n\nLooking forward to connecting,\n{{agent}}`,
  },
  {
    id: 'fu-1',
    title: 'Follow-Up After Showing',
    channel: 'text',
    category: 'follow-up',
    body: `Hey {{name}}, great meeting you at {{address}} today! What were your overall thoughts? Happy to answer any questions or pull comps if the price is a factor.`,
  },
  {
    id: 'fu-2',
    title: 'Re-Engage — Gone Quiet',
    channel: 'text',
    category: 'follow-up',
    body: `Hi {{name}}, just checking in — the market has been moving fast and I want to make sure you don't miss out on the right home. Anything change on your end, or still actively looking?`,
  },
  {
    id: 'fu-3',
    title: 'Price Reduction Alert',
    channel: 'text',
    category: 'follow-up',
    body: `{{name}} — good news! {{address}} just dropped to {{price}}. This one matched what you were looking for. Want to take a look before the weekend?`,
  },
  {
    id: 'oh-1',
    title: 'Open House Follow-Up',
    channel: 'text',
    category: 'open-house',
    body: `Hi {{name}}, thanks for stopping by {{address}} today! What did you think? I have a few similar homes that just came to market — want me to send them over?`,
  },
  {
    id: 'oh-2',
    title: 'Open House — No Show Reschedule',
    channel: 'text',
    category: 'open-house',
    body: `Hey {{name}}, I held an open house at {{address}} this weekend — sorry we missed you! I have private showing availability this week if you'd still like to see it.`,
  },
  {
    id: 'ms-1',
    title: 'Under Contract Congrats',
    channel: 'text',
    category: 'milestone',
    body: `{{name}} — we're officially under contract! 🎉 Next up is inspection on {{date}}. I'll keep you posted every step of the way. Exciting times ahead!`,
  },
  {
    id: 'ms-2',
    title: 'Closing Day',
    channel: 'text',
    category: 'milestone',
    body: `Congratulations {{name}}! Today's the day — you're officially a homeowner! 🏡 It's been a pleasure working with you. Enjoy every moment in your new home!`,
  },
  {
    id: 'nr-1',
    title: 'Home Anniversary',
    channel: 'text',
    category: 'nurture',
    body: `Happy home anniversary, {{name}}! Can you believe it's been a year? I hope you've loved every minute. If you ever have questions about your home's value or want to chat real estate, I'm always here.`,
  },
  {
    id: 'nr-2',
    title: 'Market Update',
    channel: 'email',
    category: 'nurture',
    body: `Hi {{name}},\n\nJust a quick market update for {{area}}:\n\n• Median sale price: {{price}}\n• Average days on market: {{dom}} days\n• Inventory: {{inventory}} homes available\n\nValues have been {{trend}} — great time to {{cta}}.\n\nQuestions? I'm always happy to chat.\n\n{{agent}}`,
  },
  {
    id: 'nr-3',
    title: 'Referral Thank You',
    channel: 'text',
    category: 'nurture',
    body: `{{name}}, thank you so much for referring {{referral}} to me — that truly means the world. I promise to take great care of them. If there's ever anything I can do for you, just say the word!`,
  },
  {
    id: 'ca-1',
    title: 'CMA Ready',
    channel: 'text',
    category: 'follow-up',
    body: `Hi {{name}}, your home valuation is ready! Based on recent sales in your neighborhood, your home is likely worth {{range}}. Want to hop on a quick call to walk through the details?`,
  },
  {
    id: 'ca-2',
    title: 'Call Script — Expired Listing',
    channel: 'call',
    category: 'new-lead',
    body: `Hi, may I speak with {{name}}? ... Hi {{name}}, this is {{agent}} with {{brokerage}}. I noticed your home at {{address}} recently came off the market, and I wanted to reach out personally. I've helped several homeowners in your area sell successfully after their listing expired — do you have 5 minutes to talk about what happened and what options you have now?`,
  },
];

const CATEGORY_LABELS: Record<Category, string> = {
  'new-lead': 'New Lead',
  'follow-up': 'Follow-Up',
  'open-house': 'Open House',
  'milestone': 'Milestone',
  'nurture': 'Nurture',
  'custom': 'Custom',
};

const CHANNEL_ICONS: Record<Channel, typeof MessageSquare> = {
  text: MessageSquare,
  email: Mail,
  call: Phone,
};

const CHANNEL_COLORS: Record<Channel, string> = {
  text: 'bg-primary/15 text-primary',
  email: 'bg-blue-500/15 text-blue-400',
  call: 'bg-emerald-500/15 text-emerald-400',
};

function loadCustom(): Template[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveCustom(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function highlightVars(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, v) =>
    `<span class="text-amber-400 font-medium">{{${v}}}</span>`
  );
}

export default function MessageTemplates() {
  const [custom, setCustom] = useState<Template[]>(loadCustom);
  const [search, setSearch] = useState('');
  const [activeChannel, setActiveChannel] = useState<Channel | 'all'>('all');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // New template form
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newChannel, setNewChannel] = useState<Channel>('text');
  const [newCategory, setNewCategory] = useState<Category>('custom');

  const all = [...BUILT_IN, ...custom];

  const filtered = all.filter(t => {
    const matchSearch = !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.body.toLowerCase().includes(search.toLowerCase());
    const matchChannel = activeChannel === 'all' || t.channel === activeChannel;
    const matchCat = activeCategory === 'all' || t.category === activeCategory;
    return matchSearch && matchChannel && matchCat;
  });

  const handleCopy = useCallback((t: Template) => {
    navigator.clipboard.writeText(t.body);
    setCopied(t.id);
    setTimeout(() => setCopied(null), 2000);
    toast({ description: `"${t.title}" copied to clipboard` });
  }, []);

  const handleDelete = useCallback((id: string) => {
    const updated = custom.filter(t => t.id !== id);
    setCustom(updated);
    saveCustom(updated);
    toast({ description: 'Template deleted' });
  }, [custom]);

  const handleSaveNew = useCallback(() => {
    if (!newTitle.trim() || !newBody.trim()) {
      toast({ description: 'Title and body are required', variant: 'destructive' });
      return;
    }
    const newT: Template = {
      id: `custom-${Date.now()}`,
      title: newTitle.trim(),
      body: newBody.trim(),
      channel: newChannel,
      category: newCategory,
      isCustom: true,
    };
    const updated = [newT, ...custom];
    setCustom(updated);
    saveCustom(updated);
    setNewTitle(''); setNewBody(''); setNewChannel('text'); setNewCategory('custom');
    setShowNew(false);
    toast({ description: 'Template saved' });
  }, [newTitle, newBody, newChannel, newCategory, custom]);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Message Templates</h1>
          <p className="text-xs text-muted-foreground">{all.length} templates · tap to copy</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5" /> New
        </Button>
      </div>

      {/* New Template Form */}
      {showNew && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">New Template</p>
            <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input
            placeholder="Template name"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="bg-muted/30"
          />
          <div className="flex gap-2">
            {(['text', 'email', 'call'] as Channel[]).map(c => (
              <button
                key={c}
                onClick={() => setNewChannel(c)}
                className={cn('flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize',
                  newChannel === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >{c}</button>
            ))}
          </div>
          <Textarea
            placeholder={`Write your template...\nUse {{name}}, {{address}}, {{agent}} for variables`}
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            className="min-h-[120px] bg-muted/30 text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Variables: <span className="text-amber-400">{'{{name}}'}</span> · <span className="text-amber-400">{'{{agent}}'}</span> · <span className="text-amber-400">{'{{address}}'}</span> · <span className="text-amber-400">{'{{price}}'}</span>
          </p>
          <Button onClick={handleSaveNew} className="w-full">Save Template</Button>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-muted/30 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(['all', 'text', 'email', 'call'] as const).map(c => (
            <button
              key={c}
              onClick={() => setActiveChannel(c)}
              className={cn('shrink-0 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors capitalize',
                activeChannel === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
              )}
            >{c === 'all' ? 'All channels' : c}</button>
          ))}
          <div className="w-px bg-border shrink-0 mx-0.5" />
          {(['all', 'new-lead', 'follow-up', 'open-house', 'milestone', 'nurture', 'custom'] as const).map(c => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={cn('shrink-0 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors',
                activeCategory === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
              )}
            >{c === 'all' ? 'All types' : CATEGORY_LABELS[c]}</button>
          ))}
        </div>
      </div>

      {/* Template count */}
      <p className="text-xs text-muted-foreground">{filtered.length} template{filtered.length !== 1 ? 's' : ''}</p>

      {/* Templates List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No templates match your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const Icon = CHANNEL_ICONS[t.channel];
            const isExpanded = expanded === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/30 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : t.id)}
                >
                  <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', CHANNEL_COLORS[t.channel])}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground capitalize">{t.channel}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[t.category]}</span>
                      {t.isCustom && <Badge variant="secondary" className="text-[9px] py-0 px-1.5">Custom</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); handleCopy(t); }}
                      className="h-7 w-7 rounded-lg bg-muted/60 hover:bg-primary/20 flex items-center justify-center transition-colors"
                      title="Copy"
                    >
                      {copied === t.id
                        ? <Check className="h-3.5 w-3.5 text-opportunity" />
                        : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {t.isCustom && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                        className="h-7 w-7 rounded-lg bg-muted/60 hover:bg-destructive/20 flex items-center justify-center transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/50">
                    <p
                      className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line font-mono"
                      dangerouslySetInnerHTML={{ __html: highlightVars(t.body) }}
                    />
                    <Button
                      size="sm"
                      className="mt-3 gap-1.5 w-full"
                      onClick={() => handleCopy(t)}
                    >
                      {copied === t.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === t.id ? 'Copied!' : 'Copy Template'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
