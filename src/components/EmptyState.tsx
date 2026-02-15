import { motion } from 'framer-motion';
import { Inbox, Target, Users, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  deals: <Target className="h-8 w-8 text-primary/40" />,
  leads: <Users className="h-8 w-8 text-primary/40" />,
  tasks: <CheckSquare className="h-8 w-8 text-primary/40" />,
};

const TYPE_ILLUSTRATIONS: Record<string, { emoji: string; bg: string }> = {
  deals: { emoji: '📊', bg: 'from-primary/5 to-primary/10' },
  leads: { emoji: '🎯', bg: 'from-opportunity/5 to-opportunity/10' },
  tasks: { emoji: '✅', bg: 'from-warning/5 to-warning/10' },
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  type?: 'deals' | 'leads' | 'tasks';
}

export function EmptyState({ icon, title, description, actionLabel, onAction, type }: EmptyStateProps) {
  const displayIcon = icon || (type && TYPE_ICONS[type]) || <Inbox className="h-8 w-8 text-muted-foreground/60" />;
  const illustration = type ? TYPE_ILLUSTRATIONS[type] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      <motion.div
        className="mb-5 relative"
        initial={{ scale: 0.8, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
      >
        {/* Decorative rings */}
        <div className="absolute inset-0 -m-4 rounded-full border border-border/20 animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute inset-0 -m-8 rounded-full border border-border/10" />
        <div className={`rounded-2xl p-5 ring-1 ring-border/40 relative ${illustration ? `bg-gradient-to-br ${illustration.bg}` : 'bg-muted/60'}`}>
          {illustration ? (
            <span className="text-3xl" role="img">{illustration.emoji}</span>
          ) : (
            displayIcon
          )}
        </div>
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-base font-semibold tracking-tight mb-1"
      >
        {title}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm text-muted-foreground max-w-xs mb-5 leading-relaxed"
      >
        {description}
      </motion.p>
      {actionLabel && onAction && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Button onClick={onAction} size="sm" className="font-medium">{actionLabel}</Button>
        </motion.div>
      )}
    </motion.div>
  );
}
