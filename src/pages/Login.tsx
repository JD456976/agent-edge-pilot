import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Tab = 'signin' | 'signup';

export default function Login() {
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <Target className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Deal Pilot</h1>
          <p className="text-sm text-muted-foreground mt-1">Your real estate command center</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1">
          <button
            onClick={() => { setTab('signin'); setError(''); setSuccess(''); }}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${tab === 'signin' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setError(''); setSuccess(''); }}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${tab === 'signup' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign Up
          </button>
        </div>

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign In'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Full Name</Label>
              <Input id="signup-name" type="text" placeholder="Alex Morgan" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input id="signup-password" type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-sm">
                <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{success}</span>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        )}

        {/* Legal links for Apple compliance */}
        <div className="mt-8 flex flex-col items-center gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <a href="https://dealpilotapp.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline">
              Privacy Policy
            </a>
            <span>·</span>
            <a href="https://dealpilotapp.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline">
              Terms of Service
            </a>
          </div>
          <a href="mailto:support@dealpilotapp.com" className="hover:text-foreground transition-colors underline">
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
