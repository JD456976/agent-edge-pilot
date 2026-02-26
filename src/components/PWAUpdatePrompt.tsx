import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

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
        <ToastAction
          altText="Update now"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateServiceWorker(true);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateServiceWorker(true);
          }}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors border-0 touch-manipulation"
        >
          Update Now
        </ToastAction>
      ),
    });
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
