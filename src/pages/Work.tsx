import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ActionComposerDrawer } from '@/components/ActionComposerDrawer';
import { Flame, Search, Plus, MapPin, Calendar, Clock, Users, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import Pipeline from '@/pages/Pipeline';
import Tasks from '@/pages/Tasks';
import type { Lead } from '@/types';

const TABS = ['Leads', 'Pipeline', 'Tasks', 'Open House'] as const;
const HEAT_FILTERS = ['All', 'Hot', 'Warm', 'Cool'] as const;

function getLeadHeatScore(lead: Lead): number {
  let score = lead.engagementScore || 0;
  if (lead.leadTemperature === 'hot') score = Math.max(score, 75);
  else if (lead.leadTemperature === 'warm') score = Math.max(score, 50);
  if (lead.lastTouchedAt) {
    const daysSince = (Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000;
    if (daysSince < 1) score += 15;
    else if (daysSince < 3) score += 8;
  }
  if (lead.statusTags?.some(t => ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase()))) score += 15;
  return Math.min(score, 100);
}

function getClientVerdict(lead: Lead, score: number): { text: string; color: string } {
  const daysSinceContact = lead.lastTouchedAt
    ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
    : null;
  const hasIntentTags = lead.statusTags?.some(t =>
    ['pre-approved', 'pre_approved', 'showing', 'appointment set', 'cash_buyer'].includes(t.toLowerCase())
  );
  const notes = (lead.notes || '').toLowerCase();
  const hasNegativeSignal = /cancel|ghost|unresponsive|no.?show|not interested/i.test(notes);

  if (hasNegativeSignal) return { text: 'Disengaging — re-qualify before investing more time', color: 'text-urgent' };
  if (score >= 80 && hasIntentTags) return { text: 'Serious buyer — high intent signals detected', color: 'text-opportunity' };
  if (score >= 80) return { text: 'Highly engaged — keep momentum going', color: 'text-opportunity' };
  if (score >= 60 && hasIntentTags) return { text: 'Engaged with intent — push toward showing', color: 'text-primary' };
  if (score >= 60) return { text: 'Warming up — needs one more quality touch', color: 'text-primary' };
  if (daysSinceContact === null) return { text: 'Never contacted — make first touch today', color: 'text-warning' };
  if (daysSinceContact > 14) return { text: `No contact in ${daysSinceContact}d — likely browsing`, color: 'text-muted-foreground' };
  if (score >= 40) return { text: 'Early stage — qualify budget and timeline', color: 'text-muted-foreground' };
  return { text: 'Cold — low activity, low engagement', color: 'text-muted-foreground' };
}

function HeatBadge({ score, onClick }: { score: number; onClick?: (e: React.MouseEvent) => void }) {
  const bg = score >= 75 ? 'bg-urgent/15 text-urgent' : score >= 50 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground';
  const label = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Cool';
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all', bg)}
    >
      <Flame className="h-2.5 w-2.5" /> {score} · {label}
    </button>
  );
}

function LeadsTab() {
  const { leads } = useData();
  const [search, setSearch] = useState('');
  const [heatFilter, setHeatFilter] = useState<typeof HEAT_FILTERS[number]>('All');
  const [executionEntity, setExecutionEntity] = useState<{ entity: Lead; entityType: 'lead' } | null>(null);

  const scored = useMemo(() =>
    leads.map(l => ({ lead: l, score: getLeadHeatScore(l) })).sort((a, b) => b.score - a.score),
    [leads]
  );

  const filtered = useMemo(() => {
    let list = scored;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ lead }) => lead.name.toLowerCase().includes(q));
    }
    if (heatFilter === 'Hot') list = list.filter(({ score }) => score >= 75);
    else if (heatFilter === 'Warm') list = list.filter(({ score }) => score >= 50 && score < 75);
    else if (heatFilter === 'Cool') list = list.filter(({ score }) => score < 50);
    return list;
  }, [scored, search, heatFilter]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="flex gap-1.5">
        {HEAT_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setHeatFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              heatFilter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No leads match your filters.</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(({ lead, score }) => {
            const daysSince = lead.lastTouchedAt
              ? Math.floor((Date.now() - new Date(lead.lastTouchedAt).getTime()) / 86400000)
              : null;
            const verdict = getClientVerdict(lead, score);
            return (
              <button
                key={lead.id}
                onClick={() => setExecutionEntity({ entity: lead, entityType: 'lead' })}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate text-primary cursor-pointer underline-offset-2 hover:underline">{lead.name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{lead.source || 'Direct'}</Badge>
                    <HeatBadge score={score} onClick={(e) => { e.stopPropagation(); setExecutionEntity({ entity: lead, entityType: 'lead' }); }} />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {daysSince !== null ? `${daysSince}d since last touch` : 'Never contacted'}
                    </span>
                  </div>
                  <p className={cn('text-xs', verdict.color)}>{verdict.text}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {executionEntity && (
        <ActionComposerDrawer
          open={!!executionEntity}
          entity={executionEntity.entity}
          entityType={executionEntity.entityType}
          onClose={() => setExecutionEntity(null)}
        />
      )}
    </div>
  );
}

interface OpenHouseItem {
  id: string;
  property_address: string;
  event_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

function OpenHouseTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openHouses, setOpenHouses] = useState<OpenHouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  const fetchOpenHouses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('open_houses')
        .select('id, property_address, event_date, notes, status, created_at')
        .eq('user_id', user.id)
        .order('event_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setOpenHouses((data as OpenHouseItem[]) || []);
    } catch {
      toast.error('Could not load open houses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpenHouses();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!address.trim()) {
      toast.error('Property address is required');
      return;
    }
    setSaving(true);
    try {
      const eventDate = date && time
        ? new Date(`${date}T${time}`).toISOString()
        : date
          ? new Date(`${date}T12:00`).toISOString()
          : null;

      const { error } = await supabase.from('open_houses').insert({
        user_id: user.id,
        property_address: address.trim(),
        event_date: eventDate,
        notes: notes.trim() || null,
      } as any);
      if (error) throw error;
      toast.success('Open house scheduled');
      setAddress('');
      setDate('');
      setTime('');
      setNotes('');
      setSheetOpen(false);
      await fetchOpenHouses();
    } catch {
      toast.error('Could not save open house');
    } finally {
      setSaving(false);
    }
  };

  const formatEventDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date set';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {openHouses.length} open house{openHouses.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => setSheetOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Schedule Open House
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : openHouses.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No open houses yet</p>
          <p className="text-xs text-muted-foreground">Schedule your first one to start capturing visitors.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {openHouses.map(oh => {
            const isPast = oh.event_date && new Date(oh.event_date) < new Date();
            return (
              <div
                key={oh.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium truncate">{oh.property_address}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatEventDate(oh.event_date)}</span>
                    {isPast && (
                      <Badge variant="secondary" className="text-[9px]">Past</Badge>
                    )}
                  </div>
                  {oh.notes && (
                    <p className="text-xs text-muted-foreground truncate">{oh.notes}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 h-8 text-xs gap-1 text-primary"
                  onClick={() => navigate(`/open-house/${oh.id}`)}
                >
                  <Users className="h-3.5 w-3.5" /> Sign-Ins
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
          <SheetHeader>
            <SheetTitle className="text-base">Schedule Open House</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Property Address</label>
              <Input
                placeholder="123 Main St, City, ST"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Time</label>
                <Input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                placeholder="Any details about the event…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="text-sm min-h-[80px]"
              />
            </div>
            <Button className="w-full h-10" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Open House'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const SOURCES = ['Zillow', 'Sphere', 'Referral', 'Open House', 'Other'] as const;

function QuickAddLeadFAB() {
  const { user } = useAuth();
  const { refreshData } = useData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [source, setSource] = useState<string>('Referral');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !user?.id) return;
    setSaving(true);
    const isEmail = contact.includes('@');
    const insertData: Record<string, unknown> = {
      name: name.trim(),
      source,
      lead_temperature: 'warm',
      engagement_score: 50,
      assigned_to_user_id: user.id,
      last_contact_at: new Date().toISOString(),
    };
    if (contact.trim()) {
      // Store in notes since leads table doesn't have phone/email columns directly
      insertData.notes = isEmail ? `Email: ${contact.trim()}` : `Phone: ${contact.trim()}`;
    }
    const { error } = await supabase.from('leads').insert(insertData as any);
    setSaving(false);
    if (error) { toast.error('Failed to add lead'); return; }
    toast.success(`${name.trim()} added to pipeline`);
    setOpen(false);
    setName(''); setContact(''); setSource('Referral');
    refreshData();
  };

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-40 group">
        <button
          onClick={() => setOpen(true)}
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
          aria-label="Add Lead"
        >
          <Plus className="h-6 w-6" />
        </button>
        <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-foreground text-background text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          Add Lead
        </span>
      </div>

      {/* Bottom Sheet */}
      {open && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card p-5 space-y-5 animate-slide-up max-w-lg mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">New Lead</h3>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors">
                <span className="text-muted-foreground text-lg leading-none">×</span>
              </button>
            </div>

            <div className="space-y-4">
              <input
                autoFocus
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-transparent border-b border-border text-lg font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary pb-2 transition-colors"
              />
              <input
                type="text"
                placeholder="Phone or Email"
                value={contact}
                onChange={e => setContact(e.target.value)}
                className="w-full bg-transparent border-b border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary pb-2 transition-colors"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Source</p>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map(s => (
                    <button
                      key={s}
                      onClick={() => setSource(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        source === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="w-full h-12 text-sm font-semibold rounded-xl"
              onClick={handleSubmit}
              disabled={!name.trim() || saving}
            >
              {saving ? 'Adding…' : 'Add to Pipeline'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Work() {
  const [tab, setTab] = useState<typeof TABS[number]>('Leads');

  return (
    <div className="animate-fade-in relative">
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors whitespace-nowrap',
              tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Leads' && <LeadsTab />}
      {tab === 'Pipeline' && <Pipeline />}
      {tab === 'Tasks' && <Tasks />}
      {tab === 'Open House' && <OpenHouseTab />}

      <QuickAddLeadFAB />
    </div>
  );
}
