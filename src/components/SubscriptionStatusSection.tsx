/**
 * Subscription status shown in Settings — now uses Stripe.
 */
import { Shield, Clock, CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { format } from 'date-fns';
import { TRIAL_DURATION_DAYS, PRICE_DISPLAY } from '@/lib/stripe/stripeConfig';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function SubscriptionStatusSection() {
  const { entitlementState, startCheckout, manageSubscription } = useEntitlement();
  const { isPro, isTrial, trialEndsAt, expiresAt, isActive } = entitlementState;
  const [loading, setLoading] = useState(false);

  const handleStartTrial = async () => {
    setLoading(true);
    try { await startCheckout(); } catch { /* redirect handles it */ }
    setLoading(false);
  };

  const handleManage = async () => {
    setLoading(true);
    try { await manageSubscription(); } catch { /* opens in new tab */ }
    setLoading(false);
  };

  if (!isActive && !isPro) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">No active subscription</p>
            <p className="text-xs text-muted-foreground">Start a {TRIAL_DURATION_DAYS}-day free trial for {PRICE_DISPLAY}</p>
          </div>
        </div>
        <Button onClick={handleStartTrial} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Start Free Trial
        </Button>
      </div>
    );
  }

  if (isTrial && trialEndsAt) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Clock className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Trial active</p>
            <p className="text-xs text-muted-foreground">
              Ends {format(new Date(trialEndsAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleManage} disabled={loading} className="w-full">
          <ExternalLink className="h-3.5 w-3.5 mr-2" />
          Manage Subscription
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
        <CheckCircle className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-medium">Deal Pilot Pro active</p>
          <p className="text-xs text-muted-foreground">
            {expiresAt ? `Renews ${format(new Date(expiresAt), 'MMM d, yyyy')}` : 'Active subscription'}
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={handleManage} disabled={loading} className="w-full">
        <ExternalLink className="h-3.5 w-3.5 mr-2" />
        Manage Subscription
      </Button>
    </div>
  );
}
