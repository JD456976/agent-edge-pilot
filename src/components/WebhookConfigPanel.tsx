import { useState, useCallback } from 'react';
import { Webhook, Loader2, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface Props {
  hasIntegration: boolean;
}

export function WebhookConfigPanel({ hasIntegration }: Props) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fub-webhook`;

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ description: 'Webhook URL copied' });
    setTimeout(() => setCopied(false), 2000);
  }, [webhookUrl]);

  if (!hasIntegration) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Real-Time Webhook</h2>
        <Badge variant="outline" className="text-[10px]">Near-instant sync</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Register this URL in your FUB account under Settings → Webhooks for real-time drift detection instead of polling.
      </p>

      <div className="flex gap-2">
        <Input value={webhookUrl} readOnly className="text-xs font-mono" />
        <Button size="sm" variant="outline" onClick={copyUrl}>
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-opportunity" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Setup steps:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Go to FUB → Settings → Webhooks</li>
          <li>Click "Add Webhook"</li>
          <li>Paste the URL above</li>
          <li>Select events: People Created/Updated, Deals Created/Updated/Closed</li>
          <li>Save — drift detection is now real-time</li>
        </ol>
      </div>

      <a
        href="https://help.followupboss.com/en/articles/webhooks"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> FUB Webhook Documentation
      </a>
    </div>
  );
}
