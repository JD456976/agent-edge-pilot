import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, CheckCircle2, Loader2, ArrowLeft, Zap, Shield, TrendingUp } from 'lucide-react';
import appIcon from '@/assets/app-icon.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = 'email' | 'sent';

export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setSubmitting(false);

    if (otpError) {
      setError(otpError.message || 'Could not send link. Please try again.');
    } else {
      setStep('sent');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding panel — desktop only */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 bg-card border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-primary/20">
              <img src={appIcon} alt="Deal Pilot" className="h-10 w-10" />
            </div>
            <span className="text-xl font-semibold">Deal Pilot</span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">AI-powered CRM for real estate agents</p>
        </div>
        <div className="relative z-10 space-y-6">
          {[
            { icon: Zap, title: 'One-tap actions', desc: 'Every suggestion executable in a single tap — built for agents on the move.' },
            { icon: TrendingUp, title: 'FUB sync', desc: 'Stays in sync with Follow Up Boss. Your leads, your pipeline, always current.' },
            { icon: Shield, title: 'Your data, your control', desc: 'Hosted on your own Supabase. No Lovable, no lock-in.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative z-10">
          <p className="text-xs text-muted-foreground">© 2026 Deal Pilot. Built for brokerages.</p>
        </div>
      </div>

      {/* Right — Auth panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3">
            <div className="h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-primary/20">
              <img src={appIcon} alt="Deal Pilot" className="h-10 w-10" />
            </div>
            <span className="text-xl font-semibold">Deal Pilot</span>
          </div>

          {step === 'email' ? (
            <>
              <div>
                <h1 className="text-2xl font-semibold">Sign in</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  We'll send a magic link to your email — no password needed.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@brokerage.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full h-11" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                  ) : (
                    <><Mail className="mr-2 h-4 w-4" />Send Sign-In Link</>
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-9 w-9 text-emerald-500" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Check your email</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a sign-in link to
                </p>
                <p className="font-mono text-sm text-primary">{email}</p>
                <p className="text-muted-foreground text-xs pt-2">
                  Click the link to sign in. It expires in 1 hour.<br />
                  Check your spam folder if you don't see it.
                </p>
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setStep('email'); setError(''); }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Use a different email
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
