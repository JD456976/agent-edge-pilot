/**
 * Non-intrusive trial banner shown once per day on Command Center.
 * Shows remaining trial days.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, parseISO } from 'date-fns';

const DISMISS_KEY = 'dp_trial_banner_dismissed';

function wasDismissedToday(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const d = new Date(ts);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

export function TrialBanner() {
  const { entitlementState } = useEntitlement();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (entitlementState.isTrial && !wasDismissedToday()) {
      setVisible(true);
    }
  }, [entitlementState.isTrial]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  const daysLeft = entitlementState.trialEndsAt
    ? Math.max(0, differenceInDays(parseISO(entitlementState.trialEndsAt), new Date()))
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-primary/10 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Trial active</span>
              {daysLeft !== null && (
                <span className="text-muted-foreground">
                  — {daysLeft === 0 ? 'expires today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                </span>
              )}
            </span>
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Dismiss trial banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Restricted mode banner for non-entitled, non-reviewer users.
 */
export function RestrictedModeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();

  // Hide for admins
  if (user?.role === 'admin') return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border text-sm">
      <span className="text-muted-foreground">
        Start your free trial to connect your data and take actions.
      </span>
      <button
        onClick={onUpgrade}
        className="text-primary font-medium hover:underline text-sm shrink-0 ml-3"
      >
        Start Trial
      </button>
    </div>
  );
}
