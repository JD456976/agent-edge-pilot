import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowRight, Mail, Shield, Zap, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Tab = 'signin' | 'signup';

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function Login() {
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setSubmitting(true);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setSubmitting(false);
      return;
    }
    const result = await signup(email, password, name);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Check your email for a verification link, then sign in.');
    }
  };

  const handleAppleSignIn = async () => {
    setError('');
    setAppleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('apple', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error instanceof Error ? result.error.message : String(result.error));
      }
    } catch (err) {
      setError('Apple sign in failed. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — Branding panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 bg-card border-r border-border relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Target className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Deal Pilot</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Real estate command center</p>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              Know your money.<br />
              <span className="text-primary">Protect your deals.</span>
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md leading-relaxed">
              The command center that shows you exactly where your income is at risk and what to do about it — before it's too late.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md">
            {[
              { icon: Shield, label: 'Risk Protection', desc: 'Money-at-risk alerts' },
              { icon: Zap, label: 'Smart Actions', desc: 'AI-prepared next steps' },
              { icon: TrendingUp, label: 'Income Forecast', desc: '90-day projections' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="card-elevated p-3 rounded-lg">
                <Icon className="h-4 w-4 text-primary mb-2" />
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-muted-foreground/60">
          Trusted by real estate professionals
        </div>
      </div>

      {/* Right — Auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
              <Target className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Deal Pilot</h1>
            <p className="text-sm text-muted-foreground mt-1">Your real estate command center</p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h2 className="text-xl font-bold tracking-tight">
              {tab === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === 'signin' ? 'Sign in to your command center' : 'Start protecting your income today'}
            </p>
          </div>

          {/* Apple Sign In */}
          <Button
            variant="outline"
            className="w-full h-11 font-medium mb-4 gap-2"
            onClick={handleAppleSignIn}
            disabled={appleLoading}
          >
            <AppleIcon className="h-4.5 w-4.5" />
            {appleLoading ? 'Connecting...' : 'Continue with Apple'}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-muted rounded-lg p-1">
            <button
              onClick={() => { setTab('signin'); setError(''); setSuccess(''); }}
              className={`flex-1 text-sm font-medium py-2 rounded-md transition-all duration-200 ${tab === 'signin' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('signup'); setError(''); setSuccess(''); }}
              className={`flex-1 text-sm font-medium py-2 rounded-md transition-all duration-200 ${tab === 'signup' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign Up
            </button>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required className="h-10" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-10 font-semibold" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name" className="text-xs font-medium">Full Name</Label>
                <Input id="signup-name" type="text" placeholder="Alex Morgan" value={name} onChange={e => setName(e.target.value)} required className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-xs font-medium">Email</Label>
                <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-xs font-medium">Password</Label>
                <Input id="signup-password" type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required className="h-10" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-sm">
                  <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{success}</span>
                </div>
              )}
              <Button type="submit" className="w-full h-10 font-semibold" disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          )}

          {/* Legal links for Apple compliance */}
          <div className="mt-10 pt-6 border-t border-border flex flex-col items-center gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <a href="https://dealpilotapp.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <span className="text-border">·</span>
              <a href="https://dealpilotapp.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Terms of Service
              </a>
            </div>
            <a href="mailto:support@dealpilotapp.com" className="hover:text-foreground transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
