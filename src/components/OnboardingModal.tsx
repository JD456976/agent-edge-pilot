import { useState } from 'react';
import { Rocket, Sparkles, LayoutDashboard, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { user } = useAuth();
  const { seedDemoData, hasData } = useData();
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<'demo' | 'empty' | null>(null);
  const [seeding, setSeeding] = useState(false);
  const isAdmin = user?.role === 'admin';

  const handleDemoSeed = async () => {
    setSeeding(true);
    await seedDemoData();
    setSeeding(false);
    setStep(3);
  };

  const handleAdminSetup = async () => {
    setSeeding(true);
    // Create default org + team
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
    setStep(2); // Continue to data choice
  };

  const finishOnboarding = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase.from('profiles').update({ onboarding_completed: true } as any).eq('user_id', authUser.id);
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 mx-4 animate-fade-in shadow-xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${s === step ? 'w-6 bg-primary' : s < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'}`}
            />
          ))}
        </div>

        {/* Step 1: Admin org setup or Agent mode choice */}
        {step === 1 && isAdmin && (
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Welcome, {user?.name?.split(' ')[0] || 'Admin'}</h2>
            <p className="text-sm text-muted-foreground">Set up your organization to get the most out of Deal Pilot.</p>
            <div className="space-y-2 pt-2">
              <Button className="w-full" onClick={handleAdminSetup} disabled={seeding}>
                {seeding ? 'Setting up...' : 'Create Organization + Team'}
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep(2)}>
                Skip for now
              </Button>
            </div>
          </div>
        )}

        {step === 1 && !isAdmin && (
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Welcome to Deal Pilot</h2>
            <p className="text-sm text-muted-foreground">Let's get you started. How would you like to begin?</p>
            <div className="space-y-2 pt-2">
              <Button className="w-full" onClick={() => { setChoice('demo'); setStep(2); }}>
                <Sparkles className="h-4 w-4 mr-2" /> Use Demo Data (Recommended)
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setChoice('empty'); setStep(3); }}>
                Connect CRM Later (Start empty)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Seed demo data */}
        {step === 2 && (
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Load Sample Data</h2>
            <p className="text-sm text-muted-foreground">
              We'll populate your account with realistic demo scenarios so you can explore every feature.
            </p>
            <div className="space-y-2 pt-2">
              <Button className="w-full" onClick={handleDemoSeed} disabled={seeding}>
                {seeding ? 'Loading demo data...' : 'Load Demo Data'}
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep(3)}>
                Skip — start empty
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Quick orientation */}
        {step === 3 && (
          <div className="text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-bold">You're All Set</h2>
            <p className="text-sm text-muted-foreground mb-2">Here's what you'll find in your Command Center:</p>
            <div className="text-left space-y-3 px-4">
              <div className="flex items-start gap-3">
                <span className="status-dot bg-primary mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Recommended First Action</p>
                  <p className="text-xs text-muted-foreground">The single most impactful thing to do right now</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="status-dot bg-opportunity mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Priority Actions</p>
                  <p className="text-xs text-muted-foreground">Ranked by urgency, revenue impact, and decay risk</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="status-dot bg-warning mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Deals at Risk</p>
                  <p className="text-xs text-muted-foreground">Deals that need attention before they slip</p>
                </div>
              </div>
            </div>
            <Button className="w-full mt-4" onClick={finishOnboarding}>
              Go to Command Center
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
