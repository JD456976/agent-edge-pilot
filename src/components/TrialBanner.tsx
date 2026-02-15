/**
 * Non-intrusive trial banner shown once per day on Command Center.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useAuth } from '@/contexts/AuthContext';

const DISMISS_KEY = 'dp_trial_banner_dismissed';

function wasDismissedToday(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const d = new Date(ts);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

export function TrialBanner() {
  const { entitlementState, canWrite } = useEntitlement();
  const { isReviewer } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for trial users, not reviewers, once per day
    if (entitlementState.isTrial && !isReviewer && !wasDismissedToday()) {
      setVisible(true);
    }
  }, [entitlementState.isTrial, isReviewer]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

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
              <span className="text-muted-foreground">— unlock your workflow</span>
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
