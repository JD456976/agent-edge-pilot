import { motion } from 'framer-motion';
import { Shield, TrendingUp, Flame, BarChart3, Zap, RefreshCw, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { PRICE_DISPLAY, TRIAL_DURATION_DAYS } from '@/lib/subscription/products';
import { useState } from 'react';

const PRO_FEATURES = [
  { icon: Shield, label: 'Money at Risk alerts' },
  { icon: Flame, label: 'Opportunity Heat tracking' },
  { icon: TrendingUp, label: 'Income Forecast engine' },
  { icon: BarChart3, label: 'Stability Score monitoring' },
  { icon: Zap, label: 'Autopilot & End-of-Day Sweep' },
  { icon: RefreshCw, label: 'Follow Up Boss integration' },
];

interface PaywallProps {
  onDismiss?: () => void;
  showDismiss?: boolean;
}

export default function Paywall({ onDismiss, showDismiss = true }: PaywallProps) {
  const { purchasePro, restore, entitlementState, loading } = useEntitlement();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    setError(null);
    setPurchasing(true);
    try {
      await purchasePro();
      if (entitlementState.error) {
        setError(entitlementState.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setRestoring(true);
    try {
      await restore();
      if (entitlementState.error) {
        setError(entitlementState.error.message);
      }
    } catch {
      setError('Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // If entitled, show success
  if (entitlementState.isPro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">You're all set!</h1>
          <p className="text-muted-foreground">Deal Pilot Pro is active.</p>
          {onDismiss && (
            <Button onClick={onDismiss}>Continue</Button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="max-w-md w-full space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Deal Pilot Pro</h1>
          <p className="text-muted-foreground text-lg">Your income command center</p>
        </div>

        {/* Features */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          {PRO_FEATURES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="flex items-center gap-3"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{f.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Pricing */}
        <div className="text-center space-y-1">
          <p className="text-2xl font-bold">{PRICE_DISPLAY}</p>
          <p className="text-sm text-muted-foreground">
            after a {TRIAL_DURATION_DAYS}-day free trial
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex gap-2 justify-center mt-2">
              <Button variant="ghost" size="sm" onClick={handlePurchase}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRestore}>
                Restore purchases
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full h-14 text-base rounded-xl gap-2"
            onClick={handlePurchase}
            disabled={purchasing || loading}
          >
            {purchasing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
            ) : (
              'Start Free Trial'
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={handleRestore}
            disabled={restoring || loading}
          >
            {restoring ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Restoring…</>
            ) : (
              'Restore Purchases'
            )}
          </Button>

          {showDismiss && onDismiss && (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={onDismiss}>
              Not now
            </Button>
          )}
        </div>

        {/* Disclaimer */}
        <div className="text-center space-y-2 pt-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Payment will be charged to your Apple ID account at confirmation of purchase.
            Subscription automatically renews unless canceled at least 24 hours before the end
            of the current period. Cancel anytime in Settings → Apple ID → Subscriptions.
          </p>

          <div className="flex items-center justify-center gap-4 text-[10px]">
            <a
              href="https://dealpilotapp.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline"
            >
              Privacy Policy
            </a>
            <a
              href="https://dealpilotapp.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline"
            >
              Terms of Use
            </a>
            <a
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline"
            >
              Apple EULA
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
