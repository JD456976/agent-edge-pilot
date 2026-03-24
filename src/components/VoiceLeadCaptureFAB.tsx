import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, X, UserPlus, Phone, Mail, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { callEdgeFunction } from '@/lib/edgeClient';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/hooks/use-toast';

interface ParsedLead {
  name: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
}

type Step = 'idle' | 'recording' | 'processing' | 'review';

export function VoiceLeadCaptureFAB() {
  const { user } = useAuth();
  const { refreshData } = useData();
  const [step, setStep] = useState<Step>('idle');
  const [rawTranscript, setRawTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedLead>({ name: '', phone: '', email: '', source: '', notes: '' });
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
      // Don't reset step here — stopRecording handles transition
    };

    recognition.start();
    recognitionRef.current = recognition;
    setStep('recording');
    setRawTranscript('');
    setParsed({ name: '', phone: '', email: '', source: '', notes: '' });
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
        source: string;
        notes: string;
        raw_transcript: string;
      }>('voice-lead-capture', { audio_text: text });

      setParsed({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        source: data.source || 'Voice Capture',
        notes: data.notes || text,
      });
      setStep('review');
    } catch {
      // Fallback: use raw transcript as notes
      setParsed({ name: '', phone: '', email: '', source: 'Voice Capture', notes: text });
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
      // Get user's org
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      // Insert lead
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name: parsed.name.trim(),
          source: parsed.source || 'Voice Capture',
          notes: parsed.notes || '',
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
            notes: parsed.notes || '',
          },
        });
      } catch {
        // FUB push failure is non-blocking
        console.warn('FUB push failed for voice-captured lead');
      }

      toast({ description: `${parsed.name} added to your pipeline` });
      refreshData();
      setStep('idle');
      setParsed({ name: '', phone: '', email: '', source: '', notes: '' });
    } catch (err: any) {
      toast({ description: err.message || 'Failed to save lead', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [parsed, user, refreshData]);

  const updateField = (field: keyof ParsedLead, value: string) => {
    setParsed(prev => ({ ...prev, [field]: value }));
  };

  // FAB only — no modal when idle
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
        )}
        aria-label="Voice Lead Capture"
      >
        <Mic className="h-6 w-6" />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={step === 'recording' ? stopRecording : cancelCapture} />

      {/* Bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl animate-slide-in-bottom"
        style={{ maxHeight: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(85dvh - 40px)' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Voice Lead Capture</span>
            </div>
            <button onClick={cancelCapture} className="h-8 w-8 rounded-full hover:bg-accent flex items-center justify-center min-h-[44px] min-w-[44px]" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Recording state */}
          {step === 'recording' && (
            <div className="text-center py-8 space-y-4">
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-destructive/20 animate-ping" />
                <button
                  onClick={stopRecording}
                  className="relative w-20 h-20 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center min-h-[44px] min-w-[44px]"
                  aria-label="Stop recording"
                >
                  <MicOff className="h-8 w-8" />
                </button>
              </div>
              <p className="text-sm font-medium">Listening…</p>
              <p className="text-xs text-muted-foreground">
                Say something like: "Met Sarah Johnson at the open house, phone 555-123-4567, looking for a 3-bedroom in Scottsdale under 600K"
              </p>
              {rawTranscript && (
                <p className="text-xs text-muted-foreground italic mt-3 px-4">"{rawTranscript}"</p>
              )}
              <Button variant="outline" size="sm" onClick={stopRecording} className="mt-4 min-h-[44px]">
                Tap to finish
              </Button>
            </div>
          )}

          {/* Processing state */}
          {step === 'processing' && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Parsing lead details…</p>
            </div>
          )}

          {/* Review form */}
          {step === 'review' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Name *</Label>
                <Input
                  value={parsed.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Full name"
                  className="mt-1 min-h-[44px]"
                />
              </div>
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
              <div>
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Input
                  value={parsed.source}
                  onChange={e => updateField('source', e.target.value)}
                  placeholder="e.g. Open House, Referral"
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Notes
                </Label>
                <Textarea
                  value={parsed.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  placeholder="Details about this lead…"
                  className="mt-1 min-h-[80px] resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 min-h-[44px]" onClick={cancelCapture}>
                  Cancel
                </Button>
                <Button className="flex-1 min-h-[44px]" onClick={saveLead} disabled={saving || !parsed.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Save & Push to FUB
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
