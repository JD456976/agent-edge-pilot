import { useState } from 'react';
import { Phone, MessageSquare, Mail, Home, StickyNote, CalendarPlus, Mic } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeClient';
import { VoiceNoteLogger } from '@/components/VoiceNoteLogger';

const TOUCH_TYPES = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'text', label: 'Text', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'showing', label: 'Showing', icon: Home },
  { value: 'note', label: 'Note', icon: StickyNote },
] as const;

type TouchType = typeof TOUCH_TYPES[number]['value'];

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: 'lead' | 'deal';
  entityId: string;
  entityTitle: string;
}

export function LogTouchModal({ open, onClose, entityType, entityId, entityTitle }: Props) {
  const { user } = useAuth();
  const { addTask, refreshData } = useData();
  const [touchType, setTouchType] = useState<TouchType>('call');
  const [note, setNote] = useState('');
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date>(addDays(new Date(), 1));
  const [submitting, setSubmitting] = useState(false);
  const [showVoice, setShowVoice] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) return;
    setSubmitting(true);

    try {
      // Get organization_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      const orgId = profile?.organization_id || user.id; // fallback

      // Insert activity event
      const { error: activityError } = await supabase.from('activity_events' as any).insert({
        user_id: user.id,
        organization_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        touch_type: touchType,
        note: note || null,
      });

      if (activityError) {
        console.error('Activity insert error:', activityError);
        toast({ description: 'Could not log touch. Please try again.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }

      // Update last_touched_at on entity
      const table = entityType === 'deal' ? 'deals' : 'leads';
      await supabase.from(table).update({
        last_touched_at: new Date().toISOString(),
      } as any).eq('id', entityId);

      // Create follow-up task if toggled
      if (createFollowUp) {
        await addTask({
          title: `Follow up: ${entityTitle}`,
          type: 'follow_up',
          dueAt: followUpDate.toISOString(),
          ...(entityType === 'lead' ? { relatedLeadId: entityId } : { relatedDealId: entityId }),
          assignedToUserId: user.id,
        });
      }

      // Auto-push note to FUB (best-effort, don't block)
      if (entityType === 'lead') {
        const { data: leadData } = await supabase.from('leads').select('imported_from').eq('id', entityId).maybeSingle();
        const fubId = (leadData as any)?.imported_from?.startsWith('fub:') ? (leadData as any).imported_from.replace('fub:', '') : null;
        if (fubId) {
          callEdgeFunction('fub-push', {
            entity_type: 'note',
            entity_id: entityId,
            action: 'create',
            fields: { fub_person_id: parseInt(fubId), body: note || `${touchType} logged via Deal Pilot`, subject: `Deal Pilot: ${touchType}` },
          }).catch((err) => {
            if (import.meta.env.DEV) console.warn('FUB push failed (non-blocking):', err);
          });
        }
      }

      await refreshData();
      toast({ description: `Touch logged — ${touchType}` });
      onClose();
      // Reset
      setNote('');
      setTouchType('call');
      setCreateFollowUp(false);
      setFollowUpDate(addDays(new Date(), 1));
      setShowVoice(false);
    } catch (err) {
      console.error('LogTouch error:', err);
      toast({ description: 'Something went wrong. Touch not saved.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Log Touch</DialogTitle>
          <DialogDescription className="text-xs">{entityTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Touch type selector */}
          <div className="flex gap-1.5 flex-wrap">
            {TOUCH_TYPES.map(t => {
              const Icon = t.icon;
              const active = touchType === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTouchType(t.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Note</Label>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setShowVoice(!showVoice)}>
                <Mic className="h-3 w-3 mr-1" /> {showVoice ? 'Hide' : 'Voice'}
              </Button>
            </div>
            {showVoice && (
              <VoiceNoteLogger
                entityType={entityType}
                entityId={entityId}
                entityTitle={entityTitle}
                onNoteReady={(cleanedNote, type) => {
                  setNote(cleanedNote);
                  const validType = TOUCH_TYPES.find(t => t.value === type);
                  if (validType) setTouchType(validType.value);
                  setShowVoice(false);
                }}
              />
            )}
            <Textarea
              placeholder="Quick note (optional)"
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 500))}
              maxLength={500}
              className="min-h-[60px] text-sm resize-none"
            />
            <span className="text-[10px] text-muted-foreground text-right block">{note.length}/500</span>
          </div>

          {/* Follow-up toggle */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="follow-up"
                checked={createFollowUp}
                onCheckedChange={setCreateFollowUp}
              />
              <Label htmlFor="follow-up" className="text-xs">Create follow-up task</Label>
            </div>

            {createFollowUp && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs w-full justify-start">
                    <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                    Due: {format(followUpDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={d => d && setFollowUpDate(d)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Logging…' : 'Log Touch'}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
