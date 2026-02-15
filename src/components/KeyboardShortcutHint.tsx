import { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const HINT_KEY = 'dp-shortcuts-hint-dismissed';

export function KeyboardShortcutHint() {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Keyboard shortcuts are irrelevant on mobile
    if (isMobile) return;
    if (localStorage.getItem(HINT_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [isMobile]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(HINT_KEY, 'true');
  };

  return (
    <button
      onClick={() => {
        dismiss();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      }}
      className={cn(
        'fixed bottom-6 right-6 z-20',
        'flex items-center gap-2 px-3 py-2 rounded-full',
        'bg-card border border-border shadow-lg',
        'text-xs text-muted-foreground hover:text-foreground',
        'animate-fade-in transition-colors cursor-pointer',
      )}
      aria-label="View keyboard shortcuts"
    >
      <Keyboard className="h-3.5 w-3.5" />
      <span>Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">?</kbd> for shortcuts</span>
      <span
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        className="ml-1 text-muted-foreground/60 hover:text-foreground"
      >
        ✕
      </span>
    </button>
  );
}
