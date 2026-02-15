import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';

interface Props {
  entityType: 'lead' | 'deal';
  entityId: string;
  entityTitle: string;
  onNoteReady: (note: string, touchType: string) => void;
}

export function VoiceNoteLogger({ entityType, entityId, entityTitle, onNoteReady }: Props) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rawTranscript, setRawTranscript] = useState('');
  const [cleanedNote, setCleanedNote] = useState('');
  const [suggestedType, setSuggestedType] = useState('note');
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      toast({ description: 'Speech recognition not supported in this browser', variant: 'destructive' });
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
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    setCleanedNote('');
    setRawTranscript('');
  }, [isSupported]);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setRecording(false);

    const text = transcriptRef.current.trim();
    if (!text) {
      toast({ description: 'No speech detected', variant: 'destructive' });
      return;
    }

    // Send to AI for cleanup
    setProcessing(true);
    try {
      const data = await callEdgeFunction<{ cleaned_note: string; suggested_touch_type: string }>('voice-transcribe', {
        audio_text: text,
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
      });
      setCleanedNote(data.cleaned_note);
      setSuggestedType(data.suggested_touch_type || 'note');
    } catch (err: any) {
      // Fallback: use raw transcript
      setCleanedNote(text);
      toast({ description: 'AI cleanup failed — using raw transcript' });
    } finally {
      setProcessing(false);
    }
  }, [entityType, entityId, entityTitle]);

  const handleUseNote = () => {
    if (cleanedNote) {
      onNoteReady(cleanedNote, suggestedType);
    }
  };

  if (!isSupported) {
    return (
      <div className="text-xs text-muted-foreground p-2 rounded-md bg-muted/50">
        Voice notes require Chrome, Edge, or Safari.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Voice Note</span>
        {recording && <Badge variant="destructive" className="text-[10px] animate-pulse">Recording…</Badge>}
      </div>

      <div className="flex gap-2">
        {!recording ? (
          <Button size="sm" variant="outline" className="text-xs" onClick={startRecording} disabled={processing}>
            <Mic className="h-3 w-3 mr-1" /> Record
          </Button>
        ) : (
          <Button size="sm" variant="destructive" className="text-xs" onClick={stopRecording}>
            <MicOff className="h-3 w-3 mr-1" /> Stop
          </Button>
        )}
      </div>

      {recording && rawTranscript && (
        <p className="text-xs text-muted-foreground italic">"{rawTranscript}"</p>
      )}

      {processing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cleaning up with AI…
        </div>
      )}

      {cleanedNote && !processing && (
        <div className="space-y-2">
          <Textarea
            value={cleanedNote}
            onChange={e => setCleanedNote(e.target.value)}
            className="text-xs min-h-[60px] resize-none"
          />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{suggestedType}</Badge>
            <Button size="sm" className="text-xs ml-auto" onClick={handleUseNote}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Use This Note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
