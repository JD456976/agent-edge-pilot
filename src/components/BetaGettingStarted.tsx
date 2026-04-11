import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ArrowRight, ChevronDown, Key, DollarSign, Users, Sparkles, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  hasFubConnected: boolean;
  hasLeads: boolean;
  hasDeals: boolean;
  hasIncomeTarget: boolean;
  onConnectCrm: () => void;
  onSetIncomeTarget: () => void;
  onLoadDemo?: () => void;
}

const DISMISS_KEY = 'dp-beta-getting-started-dismissed';

export function BetaGettingStarted({ hasFubConnected, hasLeads, hasDeals, hasIncomeTarget, onConnectCrm, onSetIncomeTarget, onLoadDemo }: Props) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [expanded, setExpanded] = useState(true);

  const steps = [
    {
      id: 'fub',
      label: 'Connect Follow Up Boss',
      description: 'Link your CRM so Deal Pilot can pull in your contacts, deals, and activity automatically.',
      detail: (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">What's an API key?</p>
          <p>Think of it as a secure password that lets Deal Pilot read your Follow Up Boss contacts. It doesn't give access to your login — just your data.</p>
          <p className="font-medium text-foreground mt-2">How to find your API key:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Log in to Follow Up Boss</li>
            <li>Click <span className="font-medium">Admin</span> in the top menu</li>
            <li>Click <span className="font-medium">API</span> in the left sidebar</li>
            <li>Click <span className="font-medium">Create API Key</span></li>
            <li>Name it "Deal Pilot" and copy the key</li>
          </ol>
          <a
            href="https://app.followupboss.com/2/api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline mt-1 font-medium"
          >
            Open FUB API Settings <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ),
      icon: Key,
      completed: hasFubConnected,
      action: onConnectCrm,
      actionLabel: 'Connect FUB',
    },
    {
      id: 'leads',
      label: 'Your leads will appear here',
      description: 'Once connected, Deal Pilot imports your leads and scores them by how likely they are to close.',
      icon: Users,
      completed: hasLeads,
    },
    {
      id: 'income',
      label: 'Set your income goal',
      description: 'Tell Deal Pilot your annual target so it can show you whether you\'re on track and what to prioritize.',
      icon: DollarSign,
      completed: hasIncomeTarget,
      action: onSetIncomeTarget,
      actionLabel: 'Set Goal',
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const allComplete = completedCount === steps.length;

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
      className="rounded-xl border border-border bg-card p-4"
    >
      <button onClick={() => setExpanded(e => !e)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="text-left">
            <h3 className="text-sm font-semibold">Welcome to Deal Pilot</h3>
            <p className="text-[11px] text-muted-foreground">{completedCount} of {steps.length} steps done</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setDismissed(true); localStorage.setItem(DISMISS_KEY, 'true'); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            Dismiss
          </button>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Progress */}
      <div className="h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
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
            <div className="space-y-2 mt-3">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className={cn(
                    'p-3 rounded-lg transition-colors',
                    step.completed ? 'bg-muted/30' : 'bg-muted/60'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {step.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-opportunity shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', step.completed && 'line-through text-muted-foreground')}>{step.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{step.description}</p>
                      {!step.completed && step.detail}
                    </div>
                    {!step.completed && step.action && (
                      <Button size="sm" variant="outline" className="text-xs shrink-0 h-9 min-w-[44px]" onClick={step.action}>
                        {step.actionLabel} <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
