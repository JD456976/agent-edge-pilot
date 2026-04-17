import { useState } from 'react';
import { Sparkles, Send, Copy, Loader2, RefreshCw, Mail, MessageSquare, Phone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  entityType: 'lead' | 'deal';
  entityId: string;
  entityName: string;
}

type DraftType = 'email' | 'text' | 'call_script';
type Tone = 'professional' | 'friendly' | 'direct';

const DRAFT_ICONS: Record<DraftType, React.ElementType> = {
  email: Mail,
  text: MessageSquare,
  call_script: Phone,
};

export function AIFollowUpPanel({ entityType, entityId, entityName }: Props) {
  const [draftType, setDraftType] = useState<DraftType>('email');
  const [tone, setTone] = useState<Tone>('professional');
  const [context, setContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<{ subject?: string; body?: string; talking_points?: string[]; opening?: string; closing?: string } | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setDraft(null);
    setRateLimitMessage(null);
    try {
      const data = await callEdgeFunction<any>('ai-follow-up', {
        entity_type: entityType,
        entity_id: entityId,
        draft_type: draftType,
        tone,
        context: context || undefined,
      });
      if (data?.limitExceeded) {
        setRateLimitMessage(data.message || 'Daily AI limit reached. Resets at midnight.');
        return;
      }
      setDraft(data);
    } catch (err: any) {
      if (err?.kind === 'rate_limited' || err?.limitExceeded || err?.details?.limitExceeded) {
        const msg = err?.details?.message || err?.message || 'Daily AI limit reached. Resets at midnight.';
        setRateLimitMessage(msg);
      } else {
        toast({ description: 'AI follow-up suggestions require FUB integration.' });
      }
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: 'Copied to clipboard' });
  };

  const Icon = DRAFT_ICONS[draftType];

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI Follow-Up Draft</h2>
      </div>

      <div className="flex gap-2">
        <Select value={draftType} onValueChange={v => { setDraftType(v as DraftType); setDraft(null); }}>
          <SelectTrigger className="text-xs h-7 flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="call_script">Call Script</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tone} onValueChange={v => setTone(v as Tone)}>
          <SelectTrigger className="text-xs h-7 flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Textarea
        placeholder="Additional context (optional) — e.g. 'They just had a baby' or 'Interested in downtown condos'"
        value={context}
        onChange={e => setContext(e.target.value)}
        className="text-xs min-h-[40px] resize-none"
      />

      <Button size="sm" className="w-full" onClick={generate} disabled={generating}>
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
        Generate {draftType === 'call_script' ? 'Call Script' : draftType === 'text' ? 'Text' : 'Email'} for {entityName}
      </Button>

      {rateLimitMessage && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-warning">
            <p className="font-medium">{rateLimitMessage}</p>
            <p className="mt-1 text-muted-foreground">You can still write a follow-up manually below.</p>
          </div>
        </div>
      )}

      {draft && (
        <div className="space-y-2 animate-fade-in">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
            {draft.subject && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Subject</p>
                <p className="text-sm font-medium">{draft.subject}</p>
              </div>
            )}

            {draft.opening && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Opening</p>
                <p className="text-sm">{draft.opening}</p>
              </div>
            )}

            {draft.body && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {draftType === 'call_script' ? 'Script' : 'Body'}
                </p>
                <p className="text-sm whitespace-pre-wrap">{draft.body}</p>
              </div>
            )}

            {draft.talking_points && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Talking Points</p>
                <ul className="text-sm space-y-1 mt-1">
                  {draft.talking_points.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.closing && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Closing</p>
                <p className="text-sm">{draft.closing}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => copyToClipboard(
              [draft.subject && `Subject: ${draft.subject}`, draft.body, draft.talking_points?.join('\n')].filter(Boolean).join('\n\n')
            )}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={generate} disabled={generating}>
              <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
