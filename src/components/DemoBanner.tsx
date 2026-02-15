import { useState } from 'react';
import { Database, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'dp-demo-banner-dismissed';

interface DemoBannerProps {
  className?: string;
}

export function DemoBanner({ className }: DemoBannerProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');

  if (dismissed) return null;

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary',
      className,
    )}>
      <div className="flex items-center gap-2">
        <Database className="h-3.5 w-3.5 shrink-0" />
        <span>You're viewing <strong>demo data</strong>. Connect your CRM or add real deals to replace it.</span>
      </div>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, 'true');
          setDismissed(true);
        }}
        className="shrink-0 p-0.5 rounded hover:bg-primary/10 transition-colors"
        aria-label="Dismiss demo banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
