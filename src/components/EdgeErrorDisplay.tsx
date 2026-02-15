import { useState } from 'react';
import { Copy, Check, AlertTriangle, WifiOff, ShieldAlert, Ban, ServerCrash, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type EdgeFunctionError, formatErrorForClipboard, getLastEdgeCall } from '@/lib/edgeClient';

interface EdgeErrorDisplayProps {
  error: EdgeFunctionError;
  functionName: string;
}

const ICON_MAP: Record<EdgeFunctionError['kind'], React.ReactNode> = {
  auth: <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />,
  network: <WifiOff className="h-4 w-4 text-destructive shrink-0" />,
  not_found: <Ban className="h-4 w-4 text-destructive shrink-0" />,
  rate_limited: <AlertTriangle className="h-4 w-4 text-warning shrink-0" />,
  server: <ServerCrash className="h-4 w-4 text-destructive shrink-0" />,
  unknown: <HelpCircle className="h-4 w-4 text-destructive shrink-0" />,
};

export function EdgeErrorDisplay({ error, functionName }: EdgeErrorDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorForClipboard(error, functionName));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-start gap-2">
        {ICON_MAP[error.kind]}
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground font-mono">ID: {error.requestId}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          <span className="ml-0.5">{copied ? 'Copied' : 'Copy details'}</span>
        </Button>
      </div>
    </div>
  );
}

/** Dev-only debug drawer showing last edge function call info */
export function EdgeDebugDrawer() {
  const [open, setOpen] = useState(false);
  const lastCall = getLastEdgeCall();

  if (import.meta.env.PROD) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-muted-foreground hover:text-foreground underline"
      >
        {open ? 'Hide' : 'Show'} debug info
      </button>
      {open && lastCall && (
        <div className="mt-1 rounded border border-border bg-muted/30 p-2 text-[10px] font-mono space-y-0.5">
          <p>Function: {lastCall.name}</p>
          <p>Status: {lastCall.status ?? '—'}</p>
          <p>Request ID: {lastCall.requestId}</p>
          {lastCall.errorKind && <p>Error: {lastCall.errorKind}</p>}
          <p>Time: {lastCall.timestamp}</p>
        </div>
      )}
      {open && !lastCall && (
        <p className="mt-1 text-[10px] text-muted-foreground">No edge function calls yet.</p>
      )}
    </div>
  );
}
