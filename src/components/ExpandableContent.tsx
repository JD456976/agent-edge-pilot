import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandableContentProps {
  children: ReactNode;
  /** Max height in pixels before truncation */
  maxHeight?: number;
  className?: string;
}

export function ExpandableContent({ children, maxHeight = 200, className }: ExpandableContentProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn('overflow-hidden transition-all duration-300')}
        style={{ maxHeight: expanded ? 'none' : maxHeight }}
      >
        {children}
      </div>
      {!expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
      )}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1 mx-auto mt-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{expanded ? 'Show less' : 'Show more'}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>
    </div>
  );
}
