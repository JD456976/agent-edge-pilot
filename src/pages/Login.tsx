import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (login(email, password)) {
      navigate('/');
    } else {
      setError('Account not found or inactive. Try a demo account below.');
    }
  };

  const quickLogin = (email: string) => {
    if (login(email, 'demo')) {
      navigate('/');
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-urgent">{error}</p>}
          <Button type="submit" className="w-full">
            Sign In <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-8">
          <p className="text-xs text-muted-foreground text-center mb-3">Quick access — Demo accounts</p>
          <div className="space-y-2">
            <button onClick={() => quickLogin('alex@dealpilot.demo')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm">
              <div className="text-left">
                <p className="font-medium">Alex Morgan</p>
                <p className="text-xs text-muted-foreground">Agent · alex@dealpilot.demo</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => quickLogin('admin@dealpilot.demo')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm">
              <div className="text-left">
                <p className="font-medium">Jordan Taylor</p>
                <p className="text-xs text-muted-foreground">Admin · admin@dealpilot.demo</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => quickLogin('reviewer@dealpilot.demo')} className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm">
              <div className="text-left">
                <p className="font-medium">App Reviewer</p>
                <p className="text-xs text-muted-foreground">Reviewer · reviewer@dealpilot.demo</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
