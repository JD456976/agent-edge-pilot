/**
 * Subtle trial/subscription status shown in Settings.
 */
import { Shield, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { format, differenceInDays } from 'date-fns';
import { TRIAL_DURATION_DAYS } from '@/lib/subscription/products';

export function SubscriptionStatusSection() {
  const { entitlementState } = useEntitlement();
  const { isPro, isTrial, trialEndsAt, expiresAt, willRenew, isActive } = entitlementState;

  if (!isActive && !isPro) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
        <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">No active subscription</p>
          <p className="text-xs text-muted-foreground">Start a {TRIAL_DURATION_DAYS}-day free trial to access Deal Pilot</p>
        </div>
      </div>
    );
  }

  if (isTrial && trialEndsAt) {
    const daysLeft = Math.max(0, differenceInDays(trialEndsAt, new Date()));
    const dayNumber = TRIAL_DURATION_DAYS - daysLeft;

    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
        <Clock className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-medium">
            Trial day {dayNumber} of {TRIAL_DURATION_DAYS}
          </p>
          <p className="text-xs text-muted-foreground">
            Ends {format(trialEndsAt, 'MMM d, yyyy')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
      <CheckCircle className="h-5 w-5 text-primary shrink-0" />
      <div>
        <p className="text-sm font-medium">Subscription active</p>
        <p className="text-xs text-muted-foreground">
          {willRenew && expiresAt
            ? `Renews ${format(expiresAt, 'MMM d, yyyy')}`
            : expiresAt
              ? `Expires ${format(expiresAt, 'MMM d, yyyy')}`
              : 'Renews monthly'}
        </p>
      </div>
    </div>
  );
}
