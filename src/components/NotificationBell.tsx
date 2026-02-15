import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { Alert } from '@/types';

interface NotificationBellProps {
  alerts: Alert[];
  onViewAlert?: (alert: Alert) => void;
}

export function NotificationBell({ alerts, onViewAlert }: NotificationBellProps) {
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dp-read-alerts');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [open, setOpen] = useState(false);

  const unreadCount = alerts.filter(a => !readIds.has(a.id)).length;

  const markAllRead = () => {
    const ids = new Set(alerts.map(a => a.id));
    setReadIds(ids);
    try { localStorage.setItem('dp-read-alerts', JSON.stringify([...ids])); } catch {}
  };

  const recent = alerts.slice(0, 8);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-urgent text-urgent-foreground text-[10px] font-bold flex items-center justify-center px-1 animate-scale-in">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
          ) : (
            recent.map(alert => (
              <button
                key={alert.id}
                onClick={() => { onViewAlert?.(alert); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border last:border-0',
                  !readIds.has(alert.id) && 'bg-primary/5',
                )}
              >
                <p className="text-sm font-medium truncate">{alert.title}</p>
                {alert.detail && <p className="text-xs text-muted-foreground truncate mt-0.5">{alert.detail}</p>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
