import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DoorOpen, Users, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const LS_KEY = 'dealPilot_openHouseKiosk';

interface Visitor {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  agentStatus: 'yes' | 'no' | 'looking' | '';
  signedInAt: string;
}

function loadVisitors(): Visitor[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

export default function OpenHouseKiosk() {
  const [visitors, setVisitors] = useState<Visitor[]>(loadVisitors);
  const [propertyAddress, setPropertyAddress] = useState(() => {
    try { return localStorage.getItem('dealPilot_kioskAddress') || ''; } catch { return ''; }
  });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agentStatus, setAgentStatus] = useState<'yes' | 'no' | 'looking' | ''>('');
  const [showThanks, setShowThanks] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(visitors)); }, [visitors]);
  useEffect(() => { localStorage.setItem('dealPilot_kioskAddress', propertyAddress); }, [propertyAddress]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const canSubmit = firstName.trim() && lastName.trim() && (phone.trim() || email.trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    const visitor: Visitor = {
      id: crypto.randomUUID(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      agentStatus: agentStatus || 'no',
      signedInAt: new Date().toISOString(),
    };
    setVisitors((p) => [visitor, ...p]);

    // Also add to pipeline leads
    try {
      const existing = JSON.parse(localStorage.getItem('dealPilot_leads') || '[]');
      existing.unshift({
        id: crypto.randomUUID(),
        name: `${visitor.firstName} ${visitor.lastName}`,
        phone: visitor.phone,
        email: visitor.email,
        source: 'Open House',
        dateAdded: new Date().toISOString().split('T')[0],
        temperature: 'warm',
        engagementScore: 50,
        lastContacted: null,
      });
      localStorage.setItem('dealPilot_leads', JSON.stringify(existing));
    } catch {}

    // Show confirmation
    setShowThanks(true);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setAgentStatus('');
    timerRef.current = setTimeout(() => setShowThanks(false), 3000);
  };

  if (showThanks) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Thanks!</h2>
          <p className="text-muted-foreground">We'll be in touch soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto animate-fade-in space-y-6 py-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <DoorOpen className="h-8 w-8 text-primary mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Open House Sign-In</h1>
        <div className="flex items-center justify-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{visitors.length} visitor{visitors.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Property address */}
      <Input
        value={propertyAddress}
        onChange={(e) => setPropertyAddress(e.target.value)}
        placeholder="Property address…"
        className="text-center text-sm font-medium border-dashed"
      />

      {/* Sign-in form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">First Name *</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Last Name *</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" type="tel" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" />
        </div>

        {/* Agent status pills */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Working with an agent?</label>
          <div className="flex gap-2">
            {([['yes', 'Yes'], ['no', 'No'], ['looking', 'Looking']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setAgentStatus(agentStatus === val ? '' : val)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium border transition-all',
                  agentStatus === val
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full h-12 text-base font-semibold"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Sign In
        </Button>
      </div>
    </div>
  );
}
