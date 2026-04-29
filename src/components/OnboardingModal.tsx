import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Sparkles, LayoutDashboard, Building2, Target, Shield, Zap, Link2, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingModalProps {
  onComplete: () => void;
}

const stepVariants = {
  enter: { opacity: 0, x: 40, scale: 0.96 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -40, scale: 0.96 },
};

const iconPulse = {
  initial: { scale: 0, rotate: -20 },
  animate: { scale: 1, rotate: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 20, delay: 0.15 } },
};

const featureStagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const featureItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

const TOTAL_STEPS = 4;

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { user } = useAuth();
  const { hasData } = useData();
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<'demo' | 'empty' | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [direction, setDirection] = useState(1);
  const isAdmin = user?.role === 'admin';

  // FUB connection state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyConnected, setApiKeyConnected] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleSkipToFub = () => {
    goToStep(3);
  };

  const handleAdminSetup = async () => {
    setSeeding(true);
    const { data: org } = await supabase.from('organizations').insert({
      name: 'My Organization',
      owner_user_id: user!.id,
    }).select().single();

    if (org) {
      const { data: team } = await supabase.from('teams').insert({
        name: 'My Team',
        organization_id: org.id,
        team_leader_user_id: user!.id,
      }).select().single();

      if (team) {
        await supabase.from('team_members').insert({
          team_id: team.id,
          user_id: user!.id,
          role: 'leader' as any,
        });
      }
    }
    setSeeding(false);
    goToStep(2);
  };

  const handleConnectFub = async () => {
    if (!apiKeyInput.trim()) return;
    setApiKeySaving(true);
    setApiKeyError(null);
    try {
      const { callEdgeFunction } = await import('@/lib/edgeClient');
      await callEdgeFunction('fub-save-key', { api_key: apiKeyInput.trim() });
      const result = await callEdgeFunction<{ valid: boolean; account?: { name: string } }>('fub-validate');
      if (result?.valid) {
        setApiKeyConnected(true);
        setApiKeyInput('');
      } else {
        setApiKeyError('Key saved but validation failed. You can continue and reconnect later in Settings > Sync.');
      }
    } catch (err: any) {
      setApiKeyError('Invalid key or connection failed. Check your FUB API key and try again.');
    } finally {
      setApiKeySaving(false);
    }
  };

  const finishOnboarding = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase.from('profiles').update({ onboarding_completed: true } as any).eq('user_id', authUser.id);
    }
    // Persist first name locally so greeting works even when Supabase is offline
    const firstName = user?.name?.split(' ')[0]?.trim();
    if (firstName) localStorage.setItem('dp_user_firstname', firstName);
    if (!localStorage.getItem('dp-focus-mode')) {
      localStorage.setItem('dp-focus-mode', 'minimal');
    }
    onComplete();
  };

  const FEATURES = [
    { icon: Target, label: 'Autopilot', desc: 'Recommends the single best next action based on your deals and leads', color: 'bg-primary' },
    { icon: Shield, label: 'Money at Risk', desc: 'Flags deals where your commission is in danger due to inactivity', color: 'bg-urgent' },
    { icon: Zap, label: 'Opportunities', desc: 'Highlights leads showing the strongest buying or selling signals', color: 'bg-opportunity' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 mx-4 shadow-xl overflow-hidden"
      >
        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
            <motion.div
              key={s}
              className="h-1.5 rounded-full bg-primary"
              initial={false}
              animate={{
                width: s === step ? 24 : s < step ? 6 : 6,
                opacity: s === step ? 1 : s < step ? 0.5 : 0.2,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          {/* Step 1: Admin org setup */}
          {step === 1 && isAdmin && (
            <motion.div
              key="step1-admin"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="text-center space-y-4"
            >
              <motion.div variants={iconPulse} initial="initial" animate="animate" className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
                <Building2 className="h-7 w-7 text-primary" />
              </motion.div>
              <h2 className="text-lg font-bold">Welcome, {user?.name?.split(' ')[0] || 'Admin'}</h2>
              <p className="text-sm text-muted-foreground">Set up your organization to get the most out of Deal Pilot.</p>
              <div className="space-y-2 pt-2">
                <Button className="w-full" onClick={handleAdminSetup} disabled={seeding}>
                  {seeding ? (
                    <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Setting up...</span>
                  ) : 'Create Organization + Team'}
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => goToStep(2)}>
                  Skip for now
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 1: Non-admin welcome */}
          {step === 1 && !isAdmin && (
            <motion.div
              key="step1-user"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="text-center space-y-4"
            >
              <motion.div variants={iconPulse} initial="initial" animate="animate" className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
                <Rocket className="h-7 w-7 text-primary" />
              </motion.div>
              <h2 className="text-lg font-bold">
                Welcome{user?.name?.split(' ')[0] ? `, ${user.name.split(' ')[0]}` : ' to Deal Pilot'}!
              </h2>
              <p className="text-sm text-muted-foreground">
                {user?.name?.split(' ')[0]
                  ? `Let's get Deal Pilot set up for you. Connect Follow Up Boss to import your leads.`
                  : `Let's get you started. Connect Follow Up Boss to import your leads.`}
              </p>
              <div className="space-y-2 pt-2">
                <Button className="w-full" onClick={() => goToStep(3)}>
                  <Link2 className="h-4 w-4 mr-2" /> Connect Follow Up Boss
                </Button>
                <Button variant="outline" className="w-full" onClick={() => goToStep(4)}>
                  Skip — start empty
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2 is now skipped — goes directly to step 3 (Connect FUB) */}

          {/* Step 3: Connect FUB */}
          {step === 3 && (
            <motion.div
              key="step3-fub"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="text-center space-y-4"
            >
              <motion.div variants={iconPulse} initial="initial" animate="animate" className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
                <Link2 className="h-7 w-7 text-primary" />
              </motion.div>
              <h2 className="text-lg font-bold">Connect Follow Up Boss</h2>
              <p className="text-sm text-muted-foreground">
                Your API key lets Agent Pilot import your leads, deals, and appointments — and push activity back to FUB automatically.
              </p>

              {!apiKeyConnected ? (
                <div className="space-y-3 pt-2">
                  <div className="rounded-lg bg-muted/50 p-3 text-left border border-border/30">
                    <p className="text-xs font-medium text-foreground mb-1">How to find your API key:</p>
                    <p className="text-xs text-muted-foreground">In FUB → click your name (top right) → Admin → API → copy the key</p>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="Paste your FUB API key"
                      value={apiKeyInput}
                      onChange={(e) => { setApiKeyInput(e.target.value); setApiKeyError(null); }}
                      className="flex-1"
                    />
                    <Button onClick={handleConnectFub} disabled={apiKeySaving || !apiKeyInput.trim()}>
                      {apiKeySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                    </Button>
                  </div>

                  {apiKeyError && (
                    <p className="text-xs text-destructive text-left">{apiKeyError}</p>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground text-xs"
                    onClick={() => goToStep(4)}
                  >
                    Skip for now — I'll connect later in Sync settings
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-medium">Follow Up Boss connected!</p>
                      <p className="text-xs text-muted-foreground">You can now import your leads and deals from the Sync page.</p>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => goToStep(4)}>
                    Continue →
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 4: Quick orientation */}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="text-center space-y-4"
            >
              <motion.div variants={iconPulse} initial="initial" animate="animate" className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
                <LayoutDashboard className="h-7 w-7 text-primary" />
              </motion.div>
              <h2 className="text-lg font-bold">You're All Set</h2>
              <p className="text-sm text-muted-foreground mb-2">Your Command Center will guide your day:</p>
              <motion.div className="text-left space-y-3 px-2" variants={featureStagger} initial="initial" animate="animate">
                {FEATURES.map(f => (
                  <motion.div key={f.label} variants={featureItem} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/40">
                    <div className={`h-7 w-7 rounded-lg ${f.color}/15 flex items-center justify-center shrink-0 mt-0.5`}>
                      <f.icon className={`h-3.5 w-3.5 text-${f.color === 'bg-primary' ? 'primary' : f.color === 'bg-urgent' ? 'urgent' : 'opportunity'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-lg bg-muted/50 p-3 mx-2 border border-border/30"
              >
                <p className="text-xs text-muted-foreground">
                  💡 Starting in <span className="font-medium text-foreground">Minimal Mode</span> — switch to Tactical or Strategic anytime.
                </p>
              </motion.div>
              <Button className="w-full mt-4" onClick={finishOnboarding}>
                Go to Command Center
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
