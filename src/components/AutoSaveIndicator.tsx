import { useState, useCallback } from 'react';
import { Check, Cloud, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SaveStatus = 'idle' | 'saving' | 'saved';

export function useAutoSaveIndicator() {
  const [status, setStatus] = useState<SaveStatus>('idle');

  const markSaving = useCallback(() => setStatus('saving'), []);
  const markSaved = useCallback(() => {
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  }, []);

  return { status, markSaving, markSaved };
}

export function AutoSaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  return (
    <div className={cn(
      'flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in',
    )}>
      {status === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving…</span>
        </>
      ) : (
        <>
          <Check className="h-3 w-3 text-opportunity" />
          <span>Saved</span>
        </>
      )}
    </div>
  );
}
