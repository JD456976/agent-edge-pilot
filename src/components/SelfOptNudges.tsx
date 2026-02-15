import { useState, useCallback } from 'react';
import { Lightbulb, X, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Nudge } from '@/lib/selfOptimizingEngine';

interface Props {
  nudges: Nudge[];
}

const CONFIDENCE_DOT: Record<string, string> = {
  HIGH: 'bg-opportunity',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground',
};

export function SelfOptNudges({ nudges }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  }, []);

  const visible = nudges.filter(n => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map(nudge => (
        <div
          key={nudge.id}
          className="rounded-lg border border-primary/10 bg-primary/5 px-4 py-3"
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{nudge.message}</p>
              {expandedId === nudge.id && (
                <div className="mt-2 text-[10px] text-muted-foreground space-y-1">
                  <p>{nudge.explanation}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn('h-1.5 w-1.5 rounded-full', CONFIDENCE_DOT[nudge.confidence])} />
                    <span>{nudge.confidence} confidence · {nudge.sampleSize} events</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setExpandedId(expandedId === nudge.id ? null : nudge.id)}
              >
                <HelpCircle className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleDismiss(nudge.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
