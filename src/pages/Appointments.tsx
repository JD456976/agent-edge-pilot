import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calendar, Plus, X, Clock, MapPin, Search, Loader2, FileText } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/* ── Types ─────────────────────────────────────────── */
type ApptType = 'CMA' | 'Showing' | 'Listing Presentation' | 'Closing' | 'Follow-Up Call';
type Outcome = 'Went great' | 'Signed' | 'Rescheduled' | 'No show' | null;

interface Appointment {
  id: string;
  leadName: string;
  leadId?: string;
  type: ApptType;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  address?: string;
  notes?: string;
  outcome?: Outcome;
  outcomeNotes?: string;
}

const STORAGE_KEY = 'dealPilot_appointments';
const APPT_TYPES: ApptType[] = ['CMA', 'Showing', 'Listing Presentation', 'Closing', 'Follow-Up Call'];

const TYPE_COLORS: Record<ApptType, string> = {
  CMA: 'bg-blue-500/15 text-blue-400',
  Showing: 'bg-violet-500/15 text-violet-400',
  'Listing Presentation': 'bg-amber-500/15 text-amber-400',
  Closing: 'bg-emerald-500/15 text-emerald-400',
  'Follow-Up Call': 'bg-rose-500/15 text-rose-400',
};

/* ── Helpers ────────────────────────────────────────── */
function getWeekDays(): { label: string; date: string }[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      date: d.toISOString().split('T')[0],
    };
  });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getSeedAppointments(): Appointment[] {
  const week = getWeekDays();
  return [
    { id: 'seed-1', leadName: 'Elena Vasquez', type: 'Showing', date: week[1]?.date || '', time: '10:00', address: '4521 Magnolia Ave, Austin TX' },
    { id: 'seed-2', leadName: 'Nina Patel', type: 'CMA', date: week[2]?.date || '', time: '14:00', address: '789 Cedar Ln, Austin TX', notes: 'Wants to list in 30 days' },
    { id: 'seed-3', leadName: 'Priya Kapoor', type: 'Follow-Up Call', date: week[4]?.date || '', time: '09:30', notes: 'Discuss financing options' },
  ];
}

/* ── Main Component ─────────────────────────────────── */
export default function Appointments() {
  const { leads } = useData();
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { const p = JSON.parse(stored); if (Array.isArray(p) && p.length) return p; }
    } catch {}
    const seeds = getSeedAppointments();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
    return seeds;
  });

  const save = useCallback((a: Appointment[]) => {
    setAppointments(a);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  }, []);

  const [showAdd, setShowAdd] = useState(false);
  const [prepAppt, setPrepAppt] = useState<Appointment | null>(null);

  const weekDays = useMemo(getWeekDays, []);
  const todayStr = new Date().toISOString().split('T')[0];

  const upcomingAppts = useMemo(() =>
    appointments.filter(a => a.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
  [appointments, todayStr]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Appointments</h1>
          <p className="text-xs text-muted-foreground">Your upcoming meetings and prep</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground gap-1" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Appointment
        </Button>
      </div>

      <Tabs defaultValue="week" className="space-y-3">
        <TabsList className="bg-muted/50 h-8">
          <TabsTrigger value="week" className="text-xs h-7">This Week</TabsTrigger>
          <TabsTrigger value="all" className="text-xs h-7">All Upcoming</TabsTrigger>
        </TabsList>

        <TabsContent value="week" className="space-y-4 mt-0">
          {weekDays.map(day => {
            const dayAppts = appointments
              .filter(a => a.date === day.date)
              .sort((a, b) => a.time.localeCompare(b.time));
            return (
              <div key={day.date}>
                <p className={cn("text-xs font-medium mb-1.5", day.date === todayStr ? 'text-primary' : 'text-muted-foreground')}>{day.label}{day.date === todayStr ? ' — Today' : ''}</p>
                <div className="border-t border-border/30 mb-2" />
                {dayAppts.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 pl-2 pb-2">Nothing scheduled</p>
                ) : dayAppts.map(a => (
                  <AppointmentCard key={a.id} appt={a} onPrep={() => setPrepAppt(a)} />
                ))}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="all" className="space-y-2 mt-0">
          {upcomingAppts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No upcoming appointments</p>
          ) : upcomingAppts.map(a => (
            <AppointmentCard key={a.id} appt={a} onPrep={() => setPrepAppt(a)} showDate />
          ))}
        </TabsContent>
      </Tabs>

      {/* Add Appointment Sheet */}
      <AddAppointmentSheet open={showAdd} onClose={() => setShowAdd(false)} leads={leads} onAdd={(a) => { save([...appointments, a]); setShowAdd(false); }} />

      {/* Prep Drawer */}
      <PrepDrawer appt={prepAppt} onClose={() => setPrepAppt(null)} leads={leads} onUpdate={(updated) => {
        save(appointments.map(a => a.id === updated.id ? updated : a));
      }} />
    </div>
  );
}

/* ── Appointment Card ──────────────────────────────── */
function AppointmentCard({ appt, onPrep, showDate }: { appt: Appointment; onPrep: () => void; showDate?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-card/50 border border-border/20 rounded-lg px-3 py-2 mb-1.5">
      <div className="text-primary font-mono text-sm font-medium w-16 shrink-0">{formatTime(appt.time)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{appt.leadName}</span>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border-0', TYPE_COLORS[appt.type])}>{appt.type}</Badge>
          {appt.outcome && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-emerald-500/15 text-emerald-400">{appt.outcome}</Badge>}
        </div>
        {(appt.address || appt.notes || showDate) && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {showDate && <span className="mr-2">{new Date(appt.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            {appt.address || appt.notes}
          </p>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10 shrink-0" onClick={onPrep}>
        <FileText className="h-3 w-3 mr-1" /> Prep
      </Button>
    </div>
  );
}

/* ── Add Appointment Sheet ─────────────────────────── */
function AddAppointmentSheet({ open, onClose, leads, onAdd }: {
  open: boolean; onClose: () => void; leads: any[];
  onAdd: (a: Appointment) => void;
}) {
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [type, setType] = useState<ApptType>('Showing');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('10:00');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    if (!leadSearch) return leads.slice(0, 6);
    const q = leadSearch.toLowerCase();
    return leads.filter(l => l.name.toLowerCase().includes(q)).slice(0, 6);
  }, [leads, leadSearch]);

  const reset = () => { setLeadSearch(''); setSelectedLead(''); setType('Showing'); setDate(new Date().toISOString().split('T')[0]); setTime('10:00'); setAddress(''); setNotes(''); };

  const handleSubmit = () => {
    const name = selectedLead || leadSearch.trim();
    if (!name) { toast({ title: 'Enter a lead name' }); return; }
    onAdd({
      id: crypto.randomUUID(),
      leadName: name,
      type, date, time,
      address: address || undefined,
      notes: notes || undefined,
    });
    toast({ title: `${name} appointment saved` });
    reset();
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto" hideClose>
        <SheetHeader className="flex-row items-center justify-between pb-3">
          <SheetTitle className="text-base">New Appointment</SheetTitle>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onClose(); reset(); }}><X className="h-4 w-4" /></Button>
        </SheetHeader>

        <div className="space-y-3">
          {/* Lead */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Lead</label>
            {selectedLead ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary">{selectedLead}</Badge>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelectedLead('')}>Change</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search or type name..." value={leadSearch} onChange={e => setLeadSearch(e.target.value)} className="pl-8 h-8 text-sm bg-muted/30" />
                </div>
                {leadSearch && filtered.length > 0 && (
                  <div className="mt-1 rounded-md bg-muted/40 border border-border/30 max-h-32 overflow-y-auto">
                    {filtered.map(l => (
                      <button key={l.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 text-foreground" onClick={() => { setSelectedLead(l.name); setLeadSearch(''); }}>
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {APPT_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all', type === t ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-sm bg-muted/30" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Time</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-8 text-sm bg-muted/30" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Address / Location</label>
            <Input placeholder="Optional" value={address} onChange={e => setAddress(e.target.value)} className="h-8 text-sm bg-muted/30" />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Input placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-sm bg-muted/30" />
          </div>

          <Button className="w-full bg-primary text-primary-foreground" onClick={handleSubmit}>Save Appointment</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Prep Drawer ───────────────────────────────────── */
function PrepDrawer({ appt, onClose, leads, onUpdate }: {
  appt: Appointment | null; onClose: () => void; leads: any[];
  onUpdate: (a: Appointment) => void;
}) {
  const [prepNotes, setPrepNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [outcomeNotes, setOutcomeNotes] = useState('');

  useEffect(() => {
    if (!appt) { setPrepNotes(null); setOutcomeNotes(''); return; }
    setOutcomeNotes(appt.outcomeNotes || '');
    generatePrep(appt);
  }, [appt?.id]);

  const generatePrep = async (a: Appointment) => {
    setLoading(true);
    setPrepNotes(null);
    try {
      const lead = leads.find(l => l.name === a.leadName);
      const { data, error } = await supabase.functions.invoke('appointment-prep', {
        body: {
          appointmentType: a.type,
          leadName: a.leadName,
          leadSource: lead?.source || 'Unknown',
          leadScore: lead?.engagementScore ?? lead?.score ?? 50,
          leadNotes: a.notes || lead?.notes || '',
        },
      });
      if (error) throw error;
      setPrepNotes(data?.prep || 'Could not generate prep notes.');
    } catch (e) {
      console.error('Prep generation failed:', e);
      setPrepNotes('Could not generate prep notes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!appt) return null;

  const OUTCOMES: Outcome[] = ['Went great', 'Signed', 'Rescheduled', 'No show'];

  return (
    <Sheet open={!!appt} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">{appt.leadName} — Prep Notes</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-xs border-0', TYPE_COLORS[appt.type])}>{appt.type}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(appt.time)}</span>
            {appt.address && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{appt.address}</span>}
          </div>

          {/* AI Prep */}
          <div className="bg-muted/30 rounded-lg p-3 border border-border/20">
            <p className="text-xs font-semibold text-primary mb-2">AI Prep Notes</p>
            {loading ? (
              <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Generating prep notes...</span>
              </div>
            ) : prepNotes ? (
              <div className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed">{prepNotes}</div>
            ) : null}
          </div>

          {/* Log Outcome */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Log Outcome</p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map(o => (
                <button key={o} onClick={() => onUpdate({ ...appt, outcome: appt.outcome === o ? null : o })}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                    appt.outcome === o ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes from this appointment</label>
            <Input placeholder="Add notes..." value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)}
              onBlur={() => { if (outcomeNotes !== (appt.outcomeNotes || '')) onUpdate({ ...appt, outcomeNotes }); }}
              className="h-8 text-sm bg-muted/30" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
