import { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ShowingFeedback {
  id: string;
  date: string;
  reaction: string;
  reactionEmoji: string;
  concern: string;
  offerLikelihood: number;
}

interface ShowingFeedbackTabProps {
  leadId: string;
  leadName: string;
}

const REACTIONS = [
  { emoji: '😍', label: 'Loved it' },
  { emoji: '😊', label: 'Liked it' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '😕', label: 'Concerns' },
] as const;

const CONCERNS = ['Price', 'Size', 'Location', 'Condition', 'Layout', 'None'] as const;

const STORAGE_KEY = 'dealPilot_showingFeedback';

function loadFeedback(leadId: string): ShowingFeedback[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return (data[leadId] || []) as ShowingFeedback[];
  } catch { return []; }
}

function saveFeedback(leadId: string, feedbacks: ShowingFeedback[]) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    data[leadId] = feedbacks;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className="p-0.5 touch-manipulation"
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >
          <Star
            className={cn(
              'h-7 w-7 transition-colors',
              n <= value ? 'fill-[hsl(45,90%,55%)] text-[hsl(45,90%,55%)]' : 'text-muted-foreground/30'
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ShowingFeedbackTab({ leadId, leadName }: ShowingFeedbackTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [reaction, setReaction] = useState<typeof REACTIONS[number] | null>(null);
  const [concern, setConcern] = useState<string | null>(null);
  const [offerRating, setOfferRating] = useState(0);
  const [history, setHistory] = useState<ShowingFeedback[]>([]);

  useEffect(() => {
    setHistory(loadFeedback(leadId));
  }, [leadId]);

  const resetForm = useCallback(() => {
    setStep(1);
    setReaction(null);
    setConcern(null);
    setOfferRating(0);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!reaction || !concern) return;
    const entry: ShowingFeedback = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      reaction: reaction.label,
      reactionEmoji: reaction.emoji,
      concern,
      offerLikelihood: offerRating,
    };
    const updated = [entry, ...history];
    setHistory(updated);
    saveFeedback(leadId, updated);
    resetForm();
  }, [reaction, concern, offerRating, history, leadId, resetForm]);

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button
          onClick={() => setShowForm(true)}
          className="w-full h-11 gap-2"
          variant="outline"
        >
          <Eye className="h-4 w-4" /> Log Showing Feedback
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Step 1: Reaction */}
          {step >= 1 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Step 1 — Buyer Reaction</p>
              <div className="flex gap-2 flex-wrap">
                {REACTIONS.map(r => (
                  <button
                    key={r.label}
                    onClick={() => { setReaction(r); if (step === 1) setStep(2); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all border',
                      reaction?.label === r.label
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    <span className="text-lg">{r.emoji}</span> {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Concern */}
          {step >= 2 && (
            <div className="space-y-2 animate-fade-in">
              <p className="text-xs font-medium text-muted-foreground">Step 2 — Top Concern</p>
              <div className="flex gap-2 flex-wrap">
                {CONCERNS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setConcern(c); if (step === 2) setStep(3); }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
                      concern === c
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Offer likelihood */}
          {step >= 3 && (
            <div className="space-y-2 animate-fade-in">
              <p className="text-xs font-medium text-muted-foreground">Step 3 — How likely to make an offer?</p>
              <StarRating value={offerRating} onChange={setOfferRating} />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!reaction || !concern || offerRating === 0}
            >
              Save Feedback
            </Button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Past Showing Feedback</p>
          {history.map(f => (
            <div key={f.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star
                      key={n}
                      className={cn(
                        'h-3 w-3',
                        n <= f.offerLikelihood ? 'fill-[hsl(45,90%,55%)] text-[hsl(45,90%,55%)]' : 'text-muted-foreground/20'
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>{f.reactionEmoji} {f.reaction}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{f.concern}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
