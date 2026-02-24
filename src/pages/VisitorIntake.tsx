import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MapPin, CheckCircle2, User, Loader2 } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edgeClient';

interface FieldDef {
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
}

export default function VisitorIntake() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [openHouse, setOpenHouse] = useState<any>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadForm();
  }, [token]);

  const loadForm = async () => {
    try {
      // Fetch open house by token (public, no auth needed — use anon key)
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

      const { data: flds, error: fErr } = await supabase
        .from('open_house_fields')
        .select('field_key, field_label, field_type, is_required, options, sort_order')
        .eq('open_house_id', oh.id)
        .order('sort_order');

      if (fErr) throw fErr;
      setFields((flds || []).map(f => ({ ...f, options: f.options as unknown as string[] | null })));
    } catch (e: any) {
      setError('Failed to load form.');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openHouse) return;

    // Validate required
    for (const f of fields) {
      if (f.is_required && !values[f.field_key]?.trim()) {
        setError(`${f.field_label} is required.`);
        return;
      }
    }

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
            full_name: values.full_name || '',
            email: values.email || '',
            phone: values.phone || '',
            responses: values,
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

  const renderField = (f: FieldDef) => {
    const val = values[f.field_key] || '';
    const onChange = (v: string) => setValues(prev => ({ ...prev, [f.field_key]: v }));

    switch (f.field_type) {
      case 'yes_no':
        return (
          <RadioGroup value={val} onValueChange={onChange} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Yes" id={`${f.field_key}-yes`} />
              <Label htmlFor={`${f.field_key}-yes`} className="text-sm">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="No" id={`${f.field_key}-no`} />
              <Label htmlFor={`${f.field_key}-no`} className="text-sm">No</Label>
            </div>
          </RadioGroup>
        );
      case 'dropdown':
      case 'multiple_choice':
        return (
          <Select value={val} onValueChange={onChange}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {(f.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'number':
        return <Input type="number" value={val} onChange={e => onChange(e.target.value)} className="h-10" />;
      case 'date':
        return <Input type="date" value={val} onChange={e => onChange(e.target.value)} className="h-10" />;
      default:
        if (f.field_key === 'visitor_notes' || f.field_key === 'areas_interest') {
          return <Textarea value={val} onChange={e => onChange(e.target.value)} rows={2} />;
        }
        return <Input type={f.field_key === 'email' ? 'email' : f.field_key === 'phone' ? 'tel' : 'text'} value={val} onChange={e => onChange(e.target.value)} className="h-10" />;
    }
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
            {fields.map(f => (
              <div key={f.field_key}>
                <Label className="text-sm">
                  {f.field_label}
                  {f.is_required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <div className="mt-1">{renderField(f)}</div>
              </div>
            ))}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
