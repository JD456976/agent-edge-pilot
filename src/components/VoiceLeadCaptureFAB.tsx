import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Loader2, X, UserPlus, Phone, Mail, FileText, Home, DollarSign, BedDouble, MapPin, User, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { callEdgeFunction } from '@/lib/edgeClient';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/hooks/use-toast';

interface ParsedLead {
  name: string;
  phone: string;
  email: string;
  leadType: string;
  priceRange: string;
  bedrooms: string;
  neighborhood: string;
  source: string;
  notes: string;
}

const EMPTY_LEAD: ParsedLead = {
  name: '', phone: '', email: '', leadType: '', priceRange: '',
  bedrooms: '', neighborhood: '', source: '', notes: '',
};

type Step = 'idle' | 'recording' | 'processing' | 'review';

export function VoiceLeadCaptureFAB() {
  const { user } = useAuth();
  const { refreshData } = useData();
  const [step, setStep] = useState<Step>('idle');
  const [rawTranscript, setRawTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedLead>(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      toast({ description: 'Voice capture requires Chrome, Edge, or Safari', variant: 'destructive' });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    transcriptRef.current = '';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      transcriptRef.current = transcript;
      setRawTranscript(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        toast({ description: 'Microphone error — try again', variant: 'destructive' });
      }
      setStep('idle');
    };

    recognition.onend = () => {
      // handled by stopRecording
    };

    recognition.start();
    recognitionRef.current = recognition;
    setStep('recording');
    setRawTranscript('');
    setParsed(EMPTY_LEAD);
  }, [isSupported]);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const text = transcriptRef.current.trim();
    if (!text) {
      toast({ description: 'No speech detected — try again', variant: 'destructive' });
      setStep('idle');
      return;
    }

    setStep('processing');

    try {
      const data = await callEdgeFunction<{
        name: string;
        phone: string;
        email: string;
        lead_type: string;
        price_range: string;
        bedrooms: string;
        neighborhood: string;
        source: string;
        notes: string;
      }>('voice-lead-capture', { audio_text: text });

      setParsed({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        leadType: data.lead_type || '',
        priceRange: data.price_range || '',
        bedrooms: data.bedrooms || '',
        neighborhood: data.neighborhood || '',
        source: data.source || 'Voice Capture',
        notes: data.notes || text,
      });
      setStep('review');
    } catch {
      setParsed({ ...EMPTY_LEAD, source: 'Voice Capture', notes: text });
      setStep('review');
      toast({ description: 'AI parsing failed — fill in details manually' });
    }
  }, []);

  const cancelCapture = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setStep('idle');
    setRawTranscript('');
  }, []);

  const saveLead = useCallback(async () => {
    if (!parsed.name.trim()) {
      toast({ description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      // Build rich notes from all fields
      const noteParts: string[] = [];
      if (parsed.leadType) noteParts.push(`Type: ${parsed.leadType}`);
      if (parsed.priceRange) noteParts.push(`Budget: ${parsed.priceRange}`);
      if (parsed.bedrooms) noteParts.push(`Bedrooms: ${parsed.bedrooms}`);
      if (parsed.neighborhood) noteParts.push(`Area: ${parsed.neighborhood}`);
      if (parsed.notes) noteParts.push(parsed.notes);
      const fullNotes = noteParts.join(' · ');

      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name: parsed.name.trim(),
          source: parsed.source || 'Voice Capture',
          notes: fullNotes,
          assigned_to_user_id: user.id,
          organization_id: profile?.organization_id || null,
          engagement_score: 50,
          last_contact_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Push to FUB silently
      try {
        await callEdgeFunction('fub-push', {
          entity_type: 'lead',
          entity_id: newLead.id,
          action: 'create',
          fields: {
            name: parsed.name.trim(),
            phone: parsed.phone || undefined,
            email: parsed.email || undefined,
            source: parsed.source || 'Voice Capture',
            notes: fullNotes,
          },
        });
      } catch {
        console.warn('FUB push failed for voice-captured lead');
      }

      toast({ description: `${parsed.name} added to your pipeline` });
      refreshData();
      setStep('idle');
      setParsed(EMPTY_LEAD);
    } catch (err: any) {
      toast({ description: 'Lead captured locally — FUB push unavailable.' });
    } finally {
      setSaving(false);
    }
  }, [parsed, user, refreshData]);

  const updateField = (field: keyof ParsedLead, value: string) => {
    setParsed(prev => ({ ...prev, [field]: value }));
  };

  // === FAB (idle state) ===
  if (step === 'idle') {
    return (
      <button
        onClick={startRecording}
        className={cn(
          'fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40',
          'h-14 w-14 rounded-full',
          'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
          'flex items-center justify-center',
          'hover:scale-105 active:scale-95 transition-transform',
          'min-h-[44px] min-w-[44px]',
          'voice-fab-pulse',
        )}
        aria-label="Voice Lead Capture"
      >
        <Mic className="h-6 w-6" />
      </button>
    );
  }

  // === Full-screen modal on mobile, centered sheet on desktop ===
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={step === 'recording' ? stopRecording : cancelCapture} />

      {/* Modal — full screen on mobile, bottom sheet on desktop */}
      <div className={cn(
        'fixed z-50 bg-card shadow-2xl animate-slide-in-bottom overflow-hidden flex flex-col',
        // Mobile: full screen
        'inset-0 lg:inset-auto',
        // Desktop: bottom sheet
        'lg:bottom-0 lg:inset-x-0 lg:rounded-t-2xl lg:border-t lg:border-border',
      )}
        style={{ maxHeight: '100dvh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>

        {/* Safe area top spacer on mobile */}
        <div className="lg:hidden w-full" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

        {/* Handle bar (desktop only) */}
        <div className="hidden lg:flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold">Voice Lead Capture</span>
          </div>
          <button onClick={cancelCapture} className="h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center min-h-[44px] min-w-[44px]" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* === Recording state === */}
          {step === 'recording' && (
            <div className="flex flex-col items-center justify-center min-h-[50dvh] lg:min-h-0 lg:py-8 space-y-6">
              {/* Pulsing mic button */}
              <div className="relative">
                <div className="absolute inset-[-12px] rounded-full bg-primary/10 animate-ping" />
                <div className="absolute inset-[-6px] rounded-full bg-primary/20 animate-pulse" />
                <button
                  onClick={stopRecording}
                  className="relative w-24 h-24 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center min-h-[44px] min-w-[44px] shadow-lg shadow-destructive/30"
                  aria-label="Stop recording"
                >
                  <MicOff className="h-10 w-10" />
                </button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-base font-semibold">Listening…</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Speak naturally — mention name, phone, budget, bedrooms, area, and how you met them
                </p>
              </div>

              {/* Live transcript */}
              {rawTranscript && (
                <div className="w-full max-w-sm rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Live Transcript</p>
                  <p className="text-sm leading-relaxed">{rawTranscript}</p>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={stopRecording} className="min-h-[44px] px-6">
                Tap when done
              </Button>
            </div>
          )}

          {/* === Processing state === */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center min-h-[50dvh] lg:min-h-0 lg:py-12 space-y-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Extracting lead details…</p>
                <p className="text-xs text-muted-foreground mt-1">AI is parsing your voice note</p>
              </div>
            </div>
          )}

          {/* === Review form === */}
          {step === 'review' && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">New Lead Preview</h3>
                {parsed.leadType && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {parsed.leadType}
                  </Badge>
                )}
              </div>

              {/* Name */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Name *
                </Label>
                <Input
                  value={parsed.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Full name"
                  className="mt-1 min-h-[44px]"
                  autoFocus
                />
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </Label>
                  <Input
                    value={parsed.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="555-123-4567"
                    type="tel"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </Label>
                  <Input
                    value={parsed.email}
                    onChange={e => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                    type="email"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Lead Type + Price Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Home className="h-3 w-3" /> Lead Type
                  </Label>
                  <Select value={parsed.leadType} onValueChange={v => updateField('leadType', v)}>
                    <SelectTrigger className="mt-1 min-h-[44px]">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="investor">Investor</SelectItem>
                      <SelectItem value="renter">Renter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Price Range
                  </Label>
                  <Input
                    value={parsed.priceRange}
                    onChange={e => updateField('priceRange', e.target.value)}
                    placeholder="e.g. $400K–$600K"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Bedrooms + Neighborhood */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <BedDouble className="h-3 w-3" /> Bedrooms
                  </Label>
                  <Input
                    value={parsed.bedrooms}
                    onChange={e => updateField('bedrooms', e.target.value)}
                    placeholder="e.g. 3–4"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Area
                  </Label>
                  <Input
                    value={parsed.neighborhood}
                    onChange={e => updateField('neighborhood', e.target.value)}
                    placeholder="e.g. Walpole, Scottsdale"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Source */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Source
                </Label>
                <Input
                  value={parsed.source}
                  onChange={e => updateField('source', e.target.value)}
                  placeholder="e.g. Open House, Referral from John Kim"
                  className="mt-1 min-h-[44px]"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Additional Notes
                </Label>
                <Textarea
                  value={parsed.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  placeholder="Timeline, preferences, special requests…"
                  className="mt-1 min-h-[80px] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 pb-2">
                <Button variant="outline" className="flex-1 min-h-[48px]" onClick={cancelCapture}>
                  Cancel
                </Button>
                <Button className="flex-1 min-h-[48px] text-sm font-semibold" onClick={saveLead} disabled={saving || !parsed.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Save to Pipeline
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
