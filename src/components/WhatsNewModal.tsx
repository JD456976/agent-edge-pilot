import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Shield, Zap, Bell, Download, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CHANGELOG_VERSION = '1.1.0';
const CHANGELOG_KEY = 'dp-changelog-seen';

interface ChangelogEntry {
  icon: React.ElementType;
  title: string;
  description: string;
  tag?: 'new' | 'improved';
}

const CHANGELOG: ChangelogEntry[] = [
  {
    icon: Camera,
    title: 'Profile Photo Upload',
    description: 'Add a personal touch with a profile avatar, visible across your dashboard.',
    tag: 'new',
  },
  {
    icon: Bell,
    title: 'Notification Preferences',
    description: 'Fine-tune which push notifications you receive — overdue tasks, risk alerts, opportunities, and more.',
    tag: 'new',
  },
  {
    icon: Download,
    title: 'Data Export',
    description: 'Export your deals, leads, and tasks as CSV or JSON for backup and analysis.',
    tag: 'new',
  },
  {
    icon: Sparkles,
    title: 'Animated Onboarding',
    description: 'A refreshed, premium onboarding flow with spring animations and guided setup.',
    tag: 'improved',
  },
  {
    icon: Shield,
    title: 'Accessibility & Polish',
    description: 'Enhanced focus rings, smoother theme transitions, and refined dark mode throughout.',
    tag: 'improved',
  },
  {
    icon: Zap,
    title: 'PWA + Native Ready',
    description: 'Install from your browser or build for App Store with Capacitor — both paths are configured.',
    tag: 'new',
  },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(CHANGELOG_KEY);
    if (seen !== CHANGELOG_VERSION) {
      // Delay so it doesn't overlap with other first-load modals
      const timer = setTimeout(() => setOpen(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(CHANGELOG_KEY, CHANGELOG_VERSION);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/70 backdrop-blur-sm z-[70]"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-x-4 top-[10%] mx-auto max-w-md bg-card border border-border rounded-2xl shadow-xl z-[71] overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold">What's New</h2>
              </div>
              <p className="text-xs text-muted-foreground">Version {CHANGELOG_VERSION} updates</p>
              <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-7 w-7" onClick={dismiss}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Entries */}
            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-3">
              {CHANGELOG.map((entry, i) => (
                <motion.div
                  key={entry.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 300, damping: 26 }}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <entry.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{entry.title}</p>
                      {entry.tag && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                          entry.tag === 'new'
                            ? 'bg-opportunity/10 text-opportunity'
                            : 'bg-primary/10 text-primary'
                        }`}>
                          {entry.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{entry.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border/50">
              <Button className="w-full" onClick={dismiss}>Got it</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
