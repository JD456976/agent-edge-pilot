/**
 * Write-action guard hook.
 * Returns a function that either executes the action or opens the paywall.
 */
import { useCallback, useState } from 'react';
import { useEntitlement } from '@/contexts/EntitlementContext';

/**
 * Hook that gates write actions behind Pro entitlement.
 *
 * Usage:
 *   const { guardAction, showPaywall, dismissPaywall } = useWriteGuard();
 *   <Button onClick={() => guardAction(() => doSomething())}>Act</Button>
 *   {showPaywall && <Paywall onDismiss={dismissPaywall} />}
 */
export function useWriteGuard() {
  const { canWrite } = useEntitlement();
  const [showPaywall, setShowPaywall] = useState(false);

  const guardAction = useCallback(
    (action: () => void) => {
      if (canWrite) {
        action();
      } else {
        setShowPaywall(true);
      }
    },
    [canWrite]
  );

  const dismissPaywall = useCallback(() => setShowPaywall(false), []);

  return { guardAction, showPaywall, dismissPaywall, canWrite };
}
