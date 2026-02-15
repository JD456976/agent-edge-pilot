import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotificationPermissionPromptProps {
  onAllow: () => void;
  onDismiss: () => void;
}

export function NotificationPermissionPrompt({ onAllow, onDismiss }: NotificationPermissionPromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-xl animate-fade-in">
        <div className="flex justify-between items-start mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="text-base font-semibold mb-1">Stay on top of your deals</h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Deal Pilot uses notifications to alert you about overdue tasks, at-risk deals, and opportunity signals — so nothing falls through the cracks.
        </p>

        <ul className="space-y-2 mb-5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-urgent shrink-0" />
            Overdue task reminders
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
            Deal risk alerts
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-opportunity shrink-0" />
            Hot lead signals
          </li>
        </ul>

        <div className="space-y-2">
          <Button className="w-full" onClick={onAllow}>
            Enable Notifications
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onDismiss}>
            Not now
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-3">
          You can change this anytime in Settings → Notifications.
        </p>
      </div>
    </div>
  );
}
