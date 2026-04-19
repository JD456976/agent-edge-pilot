import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X, ChevronRight, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WorkspaceOverlayShellProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function WorkspaceOverlayShell({ title, subtitle, open, onClose, children }: WorkspaceOverlayShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex" style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {/* Dimmed backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm touch-none"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'relative z-10 flex flex-col w-full h-full bg-background',
              'lg:ml-56',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <header className="flex items-center justify-between px-4 lg:px-6 border-b border-border bg-card shrink-0" style={{ minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Back</span>
                </Button>
                <div className="h-4 w-px bg-border hidden sm:block" />
                {/* Breadcrumb */}
                <nav className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
                  <button onClick={onClose} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    <LayoutDashboard className="h-3 w-3" />
                    <span>Home</span>
                  </button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{title}</span>
                </nav>
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10 min-h-[44px] min-w-[44px]" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </header>

            {/* Mobile title (below header) */}
            <div className="sm:hidden px-4 pt-3 pb-1">
              <h2 className="text-sm font-semibold">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6 pb-24 lg:pb-8"
            >
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
