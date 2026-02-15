import { Inbox, Target, Users, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  deals: <Target className="h-8 w-8 text-primary/40" />,
  leads: <Users className="h-8 w-8 text-primary/40" />,
  tasks: <CheckSquare className="h-8 w-8 text-primary/40" />,
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional type hint for contextual illustration */
  type?: 'deals' | 'leads' | 'tasks';
}

export function EmptyState({ icon, title, description, actionLabel, onAction, type }: EmptyStateProps) {
  const displayIcon = icon || (type && TYPE_ICONS[type]) || <Inbox className="h-8 w-8 text-muted-foreground/60" />;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="mb-5 relative">
        {/* Decorative rings */}
        <div className="absolute inset-0 -m-3 rounded-full border border-border/30 animate-pulse" style={{ animationDuration: '3s' }} />
        <div className="absolute inset-0 -m-6 rounded-full border border-border/15" />
        <div className="rounded-2xl bg-muted/60 p-5 ring-1 ring-border/50 relative">
          {displayIcon}
        </div>
      </div>
      <h3 className="text-base font-semibold tracking-tight mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="font-medium">{actionLabel}</Button>
      )}
    </div>
  );
}
