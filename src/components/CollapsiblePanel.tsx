import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  id: string;
  label: string;
  icon?: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children: ReactNode;
  className?: string;
}

export function CollapsiblePanel({ id, label, icon, isCollapsed, onToggleCollapse, children, className }: CollapsiblePanelProps) {
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className={cn(
          'w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground -rotate-90" />
      </button>
    );
  }

  return (
    <div className={cn('relative group/collapse', className)}>
      <button
        onClick={onToggleCollapse}
        className="absolute top-2.5 right-2.5 z-10 p-1 rounded-md hover:bg-accent/50 transition-colors opacity-0 group-hover/collapse:opacity-100"
        aria-label={`Collapse ${label}`}
      >
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}
