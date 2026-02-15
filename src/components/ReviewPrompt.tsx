import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';

const STORAGE_KEY = 'dp_review_prompt';
const MILESTONE_THRESHOLDS = [3, 10, 25]; // closed deals

interface ReviewState {
  dismissed: boolean;
  lastMilestone: number;
  promptedAt?: string;
}

function getState(): ReviewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { dismissed: false, lastMilestone: 0 };
  } catch {
    return { dismissed: false, lastMilestone: 0 };
  }
}

function setState(s: ReviewState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function ReviewPrompt() {
  const { deals } = useData();
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState(0);

  useEffect(() => {
    const state = getState();
    if (state.dismissed) return;

    const closedCount = deals.filter(d => d.stage === 'closed').length;
    const nextMilestone = MILESTONE_THRESHOLDS.find(t => t > state.lastMilestone && closedCount >= t);

    if (nextMilestone) {
      setMilestone(nextMilestone);
      setVisible(true);
    }
  }, [deals]);

  const dismiss = (permanent = false) => {
    const state = getState();
    setState({ ...state, dismissed: permanent, lastMilestone: milestone });
    setVisible(false);
  };

  const handleRate = () => {
    // On native, this would open the App Store review prompt
    // For PWA, we can link to a feedback form or external review
    dismiss(true);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl shadow-black/20 relative">
            <button
              onClick={() => dismiss(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-center space-y-3">
              <div className="flex justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 400 }}
                  >
                    <Star className="h-6 w-6 text-accent fill-accent" />
                  </motion.div>
                ))}
              </div>

              <div>
                <p className="font-semibold text-sm">
                  🎉 {milestone} Deals Closed!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You're on a roll! If Deal Pilot is helping you close more deals, we'd love a quick review.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => dismiss(false)}
                >
                  Maybe Later
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={handleRate}
                >
                  <Star className="h-3.5 w-3.5" />
                  Rate Us
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
