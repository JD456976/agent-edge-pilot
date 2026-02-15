import { useState, useEffect } from 'react';
import { Download, CheckCircle, Share, MoreVertical, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">You're all set!</h1>
          <p className="text-muted-foreground">Deal Pilot is already installed on your device.</p>
          <Button onClick={() => window.location.href = '/'}>Open App</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-4">
          <img src="/icon-512.png" alt="Deal Pilot" className="h-24 w-24 rounded-2xl mx-auto shadow-2xl shadow-primary/20" />
          <h1 className="text-3xl font-bold tracking-tight">Install Deal Pilot</h1>
          <p className="text-muted-foreground text-lg">
            Get instant access from your home screen. Works offline, loads fast, feels native.
          </p>
        </div>

        {installed ? (
          <div className="space-y-3">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="font-semibold text-lg">Successfully installed!</p>
            <p className="text-sm text-muted-foreground">Look for Deal Pilot on your home screen.</p>
          </div>
        ) : isIOS ? (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 text-left">
            <p className="font-semibold text-center">Install on iPhone / iPad</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Share className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Tap the Share button</p>
                  <p className="text-xs text-muted-foreground">In Safari's bottom toolbar</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Tap "Add to Home Screen"</p>
                  <p className="text-xs text-muted-foreground">Scroll down in the share sheet</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Tap "Add"</p>
                  <p className="text-xs text-muted-foreground">Deal Pilot will appear on your home screen</p>
                </div>
              </div>
            </div>
          </div>
        ) : deferredPrompt ? (
          <Button size="lg" onClick={handleInstall} className="w-full h-14 text-lg gap-3 rounded-xl">
            <Download className="h-5 w-5" />
            Install Deal Pilot
          </Button>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 text-left">
            <p className="font-semibold text-center">Install on Android</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <MoreVertical className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Tap the browser menu</p>
                  <p className="text-xs text-muted-foreground">Three dots in Chrome</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Tap "Install app" or "Add to Home Screen"</p>
                  <p className="text-xs text-muted-foreground">Deal Pilot will install as an app</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 pt-4">
          {[
            { label: 'Offline Ready', desc: 'Works without internet' },
            { label: 'Fast Launch', desc: 'Instant from home screen' },
            { label: 'Auto Updates', desc: 'Always the latest version' },
          ].map(f => (
            <div key={f.label} className="text-center space-y-1">
              <p className="text-xs font-semibold">{f.label}</p>
              <p className="text-[10px] text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        <Button variant="ghost" onClick={() => window.location.href = '/'} className="text-muted-foreground">
          Continue in browser
        </Button>
      </div>
    </div>
  );
}
