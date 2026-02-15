import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Dimmed backdrop — click to close */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex flex-col w-full bg-background',
          'md:ml-56', // account for sidebar
          'animate-in slide-in-from-bottom-2 fade-in duration-300 ease-out',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Back to Command Center</span>
            </Button>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="hidden sm:block">
              <h2 className="text-sm font-semibold leading-none">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Mobile title (below header) */}
        <div className="sm:hidden px-4 pt-3 pb-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
