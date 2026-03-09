import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MapPin, CheckCircle2, User, Loader2 } from 'lucide-react';

export default function VisitorIntake() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [openHouse, setOpenHouse] = useState<any>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [workingWithAgent, setWorkingWithAgent] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: oh, error: ohErr } = await supabase
          .from('open_houses')
          .select('*')
          .eq('intake_token', token)
          .eq('status', 'active')
          .maybeSingle();

        if (ohErr || !oh) {
          setError('This open house link is no longer active.');
          setLoading(false);
          return;
        }
        setOpenHouse(oh);
      } catch {
        setError('Failed to load form.');
      }
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openHouse) return;

    // Validate
    if (!fullName.trim()) { setError('Please enter your name.'); return; }
    if (!phone.trim() && !email.trim()) { setError('Please enter a phone number or email address.'); return; }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oh-visitor-submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            intake_token: token,
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            responses: {
              full_name: fullName.trim(),
              email: email.trim(),
              phone: phone.trim(),
              working_with_agent: workingWithAgent,
            },
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Submission failed');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !openHouse) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    const settings = openHouse?.form_settings as any;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold">Thank You for Visiting!</h2>
            <p className="text-sm text-muted-foreground">We appreciate you signing in. You'll hear from us soon!</p>
            {settings?.show_contact_card && openHouse && (
              <div className="border-t border-border pt-4 mt-4">
                {openHouse.agent_name && (
                  <div className="flex items-center gap-2 justify-center mb-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{openHouse.agent_name}</span>
                  </div>
                )}
                {openHouse.agent_phone && <p className="text-xs text-muted-foreground">{openHouse.agent_phone}</p>}
                {openHouse.agent_email && <p className="text-xs text-muted-foreground">{openHouse.agent_email}</p>}
                {openHouse.brokerage && <p className="text-[10px] text-muted-foreground mt-1">{openHouse.brokerage}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-start flex-col p-4 pt-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">{openHouse?.property_address}</h1>
            </div>
            {openHouse?.agent_name && (
              <p className="text-sm text-muted-foreground">Hosted by {openHouse.agent_name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Please sign in below</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <Label className="text-sm">Full Name <span className="text-destructive">*</span></Label>
              <Input
                type="text"
                placeholder="Your name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="h-11 mt-1"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <Label className="text-sm">Phone</Label>
              <Input
                type="tel"
                placeholder="(555) 555-1234"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-11 mt-1"
              />
            </div>

            {/* Email */}
            <div>
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-11 mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Phone or email required</p>
            </div>

            {/* Working with agent */}
            <div>
              <Label className="text-sm">Are you currently working with a real estate agent?</Label>
              <RadioGroup
                value={workingWithAgent}
                onValueChange={setWorkingWithAgent}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Yes" id="agent-yes" />
                  <Label htmlFor="agent-yes" className="text-sm">Yes</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="No" id="agent-no" />
                  <Label htmlFor="agent-no" className="text-sm">No</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Just Looking" id="agent-looking" />
                  <Label htmlFor="agent-looking" className="text-sm">Just Looking</Label>
                </div>
              </RadioGroup>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" className="w-full h-11 min-h-[44px]" disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
