import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '@/hooks/use-toast';

export function PWAUpdatePrompt() {
  const { toast } = useToast();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every 30 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    toast({
      title: '🚀 Update Available',
      description: 'A new version of Deal Pilot is ready.',
      duration: Infinity,
      action: (
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Update Now
        </button>
      ),
    });
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
