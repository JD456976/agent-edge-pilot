import { useState, useMemo } from 'react';
import { Search, FileText } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Template {
  name: string;
  body: string;
}

interface Section {
  title: string;
  templates: Template[];
}

const SECTIONS: Section[] = [
  {
    title: 'Follow-Up',
    templates: [
      { name: 'Just Checking In', body: "Hi [Name], just wanted to check in and see if you're still thinking about buying/selling. The market has been moving quickly and I'd love to catch up. Any questions I can answer?" },
      { name: "Haven't Heard From You", body: "Hi [Name], I know life gets busy! I wanted to touch base — I'm still here whenever you're ready to talk real estate. No pressure at all." },
      { name: 'New Listings Alert', body: "Hi [Name], a few new listings just hit that match what you're looking for. Want me to send them over? Happy to set up tours this week." },
    ],
  },
  {
    title: 'Nurture',
    templates: [
      { name: 'Market Update', body: "Hi [Name], quick market update for you — homes in your area are selling fast right now. This affects your buying power. Worth a quick chat?" },
      { name: 'Thinking of You', body: "Hi [Name], just thinking about our conversation and wanted to say I'm still here whenever you're ready. No rush — buying and selling on your timeline is what matters." },
      { name: 'Value Reminder', body: "Hi [Name], as your agent I'm always watching the market for you even when we're not actively searching. Saw something interesting and wanted to share." },
    ],
  },
  {
    title: 'Milestones',
    templates: [
      { name: 'Happy Home Anniversary', body: "Hi [Name]! Happy home anniversary — it's been a year since you closed on your home! Hope you're loving every minute. If you ever want to know what it's worth today, I'm happy to pull the numbers." },
      { name: 'Congrats on Your New Home', body: "Hi [Name], just wanted to say congratulations again on your new home! It was such a pleasure working with you. Please don't hesitate to reach out for anything at all." },
      { name: 'Referral Thank You', body: "Hi [Name], thank you so much for the referral — that truly means the world. I'll take great care of them, and I'm always here for you too." },
    ],
  },
  {
    title: 'Listing Updates',
    templates: [
      { name: 'Price Improvement', body: "Hi [Name], great news — the sellers just reduced the price. This property is now even better value. Still interested?" },
      { name: 'Open House Invite', body: "Hi [Name], I'm hosting an open house this weekend. It's a beautiful home that I think you'd love — would you like to stop by?" },
      { name: 'Just Listed', body: "Hi [Name], I just listed a great property — thought of you immediately. Want to take a look before it hits the market?" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  leadFirstName: string;
  onSelect: (body: string) => void;
}

export function MessageTemplatesSheet({ open, onClose, leadFirstName, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.map(s => ({
      ...s,
      templates: s.templates.filter(t => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)),
    })).filter(s => s.templates.length > 0);
  }, [search]);

  const handlePick = (body: string) => {
    const personalized = body.replace(/\[Name\]/g, leadFirstName || 'there');
    onSelect(personalized);
    onClose();
    setSearch('');
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[70dvh] rounded-t-2xl pb-safe">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Message Templates</SheetTitle>
          <SheetDescription className="sr-only">Choose a template to insert</SheetDescription>
        </SheetHeader>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="overflow-y-auto max-h-[calc(70dvh-130px)] space-y-4 pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No templates match your search</p>
          )}
          {filtered.map(section => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.title}</h3>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{section.templates.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {section.templates.map(t => (
                  <button
                    key={t.name}
                    onClick={() => handlePick(t.body)}
                    className="w-full text-left rounded-md border border-border p-2.5 hover:bg-accent/40 transition-colors"
                  >
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function TemplatesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs h-7 px-3 rounded-full border-primary/40 text-primary hover:bg-primary/10"
      onClick={onClick}
    >
      <FileText className="h-3 w-3 mr-1.5" />
      Templates
    </Button>
  );
}
