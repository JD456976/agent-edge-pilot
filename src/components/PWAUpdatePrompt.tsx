import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function PWAUpdatePrompt() {
  const { toast } = useToast();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    const checkForUpdate = async () => {
      const registration = await navigator.serviceWorker.ready;

      // Check if there's already a waiting worker
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        return;
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    checkForUpdate();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!waitingWorker) return;

    toast({
      title: '🚀 Update Available',
      description: 'A new version of Deal Pilot is ready.',
      duration: Infinity,
      action: (
        <button
          onClick={() => {
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
          }}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Update Now
        </button>
      ),
    });
  }, [waitingWorker, toast]);

  return null;
}
