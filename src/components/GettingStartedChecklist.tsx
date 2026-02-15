import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, RefreshCw, Plus, Target, DollarSign, ArrowRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  completed: boolean;
  action?: () => void;
  actionLabel?: string;
}

interface GettingStartedChecklistProps {
  hasCrmConnected: boolean;
  hasDeals: boolean;
  hasLeads: boolean;
  hasTasks: boolean;
  hasIncomeTarget: boolean;
  onConnectCrm: () => void;
  onAddDeal: () => void;
  onSetIncomeTarget: () => void;
  onLoadDemo: () => void;
}

const DISMISS_KEY = 'dp-getting-started-dismissed';

export function GettingStartedChecklist({
  hasCrmConnected,
  hasDeals,
  hasLeads,
  hasTasks,
  hasIncomeTarget,
  onConnectCrm,
  onAddDeal,
  onSetIncomeTarget,
  onLoadDemo,
}: GettingStartedChecklistProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(!isMobile);

  const steps: ChecklistStep[] = [
    {
      id: 'crm',
      label: 'Connect your CRM',
      description: 'Import deals and leads from Follow Up Boss',
      icon: RefreshCw,
      completed: hasCrmConnected,
      action: onConnectCrm,
      actionLabel: 'Connect',
    },
    {
      id: 'deals',
      label: 'Add your first deal',
      description: 'Track a deal to see income projections',
      icon: DollarSign,
      completed: hasDeals,
      action: onAddDeal,
      actionLabel: 'Add Deal',
    },
    {
      id: 'leads',
      label: 'Add or import leads',
      description: 'Track leads to surface opportunities',
      icon: Target,
      completed: hasLeads,
    },
    {
      id: 'income',
      label: 'Set your income target',
      description: 'Get personalized stability and forecast insights',
      icon: Target,
      completed: hasIncomeTarget,
      action: onSetIncomeTarget,
      actionLabel: 'Set Target',
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const allComplete = completedCount === steps.length;

  // Auto-dismiss when all complete
  useEffect(() => {
    if (allComplete && !dismissed) {
      const timer = setTimeout(() => {
        setDismissed(true);
        localStorage.setItem(DISMISS_KEY, 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, dismissed]);

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card p-4"
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full mb-3"
      >
        <div>
          <h3 className="text-sm font-semibold text-left">Getting Started</h3>
          <p className="text-xs text-muted-foreground">{completedCount} of {steps.length} complete</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-9 min-w-[44px]" onClick={(e) => { e.stopPropagation(); onLoadDemo(); }}>
            Load demo data
          </Button>
          <button
            onClick={(e) => { e.stopPropagation(); setDismissed(true); localStorage.setItem(DISMISS_KEY, 'true'); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            Dismiss
          </button>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(completedCount / steps.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
        <AnimatePresence>
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                step.completed ? 'bg-muted/30' : 'bg-muted/60'
              )}
            >
              {step.completed ? (
                <CheckCircle2 className="h-4 w-4 text-opportunity shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', step.completed && 'line-through text-muted-foreground')}>{step.label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug">{step.description}</p>
              </div>
              {!step.completed && step.action && (
                <Button size="sm" variant="outline" className="text-xs shrink-0 h-9 min-w-[44px]" onClick={step.action}>
                  {step.actionLabel} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
