import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Users, UserCheck, UserPlus, Clock, Flame, Sparkles, Repeat, Loader2, Mail, Phone, ChevronRight, ArrowLeft, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState } from '@/components/EmptyState';
import { toast } from 'sonner';
import { scoreVisitorIntent, analyzeCrossEventVisitor, type IntentScore, type CrossEventInsight } from '@/lib/visitorIntentScoring';
import { callEdgeFunction } from '@/lib/edgeClient';

export function CapturedVisitors() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [selectedHouse, setSelectedHouse] = useState('all');
  const [generatingFollowUps, setGeneratingFollowUps] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);

  const { data: openHouses = [] } = useQuery({
    queryKey: ['open-houses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_houses').select('id, property_address').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: visitors = [], isLoading } = useQuery({
    queryKey: ['oh-visitors', user?.id, selectedHouse],
    queryFn: async () => {
      let q = supabase.from('open_house_visitors').select('*, open_houses!inner(property_address)').order('created_at', { ascending: false });
      if (selectedHouse !== 'all') q = q.eq('open_house_id', selectedHouse);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allVisitors = [] } = useQuery({
    queryKey: ['oh-all-visitors-cross', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_house_visitors').select('*, open_houses!inner(property_address)');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('oh-visitors-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'open_house_visitors', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const v = payload.new as any;
          toast.info(`🔔 ${v.full_name} just signed in!`, {
            description: v.is_existing_contact ? '⚡ Existing contact detected' : '✨ New lead captured',
            duration: 8000,
          });
          queryClient.invalidateQueries({ queryKey: ['oh-visitors'] });
          queryClient.invalidateQueries({ queryKey: ['oh-all-visitors-cross'] });
          queryClient.invalidateQueries({ queryKey: ['open-house-visitor-counts'] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const enrichedVisitors = visitors.map(v => {
    const responses = v.responses as Record<string, any>;
    const intent = scoreVisitorIntent(responses, !!v.email, !!v.phone);
    const crossEvent = v.email ? analyzeCrossEventVisitor(v.email, allVisitors as any) : null;
    return { ...v, intent, crossEvent };
  });

  const filtered = enrichedVisitors.filter(v => {
    if (filter === 'new') return !v.is_existing_contact;
    if (filter === 'existing') return v.is_existing_contact;
    if (filter === 'uncontacted') return v.follow_up_status === 'uncontacted';
    if (filter === 'hot') return v.intent.label === 'Hot';
    if (filter === 'repeat') return v.crossEvent?.isRepeatVisitor;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.intent.score - a.intent.score);

  const handleGenerateFollowUps = async () => {
    if (!selectedHouse || selectedHouse === 'all') {
      toast.error('Select a specific open house first');
      return;
    }
    setGeneratingFollowUps(true);
    try {
      const res = await callEdgeFunction('oh-generate-followups', {
        method: 'POST',
        body: { open_house_id: selectedHouse },
      });
      if (res.drafts?.length) {
        toast.success(`Generated ${res.drafts.length} follow-up drafts!`, { description: 'Check below for personalized emails.' });
        setFollowUpDrafts(res.drafts);
      } else {
        toast.info('No drafts generated — check that visitors have email addresses.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate follow-ups');
    }
    setGeneratingFollowUps(false);
  };

  const [followUpDrafts, setFollowUpDrafts] = useState<any[]>([]);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  if (isLoading) return <div className="h-40 bg-muted/50 rounded-lg animate-pulse" />;

  const hotCount = enrichedVisitors.filter(v => v.intent.label === 'Hot').length;
  const repeatCount = enrichedVisitors.filter(v => v.crossEvent?.isRepeatVisitor).length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={selectedHouse} onValueChange={setSelectedHouse}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All Open Houses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Open Houses</SelectItem>
            {openHouses.map(oh => (
              <SelectItem key={oh.id} value={oh.id}>{oh.property_address}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Visitors</SelectItem>
            <SelectItem value="new">New Leads</SelectItem>
            <SelectItem value="existing">Existing Contacts</SelectItem>
            <SelectItem value="uncontacted">Uncontacted</SelectItem>
            <SelectItem value="hot">🔥 Hot Leads</SelectItem>
            <SelectItem value="repeat">🔁 Repeat Visitors</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={handleGenerateFollowUps}
          disabled={generatingFollowUps || selectedHouse === 'all'}
        >
          {generatingFollowUps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI Follow-Ups
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: visitors.length, icon: Users, color: 'text-primary' },
          { label: 'New', value: visitors.filter(v => !v.is_existing_contact).length, icon: UserPlus, color: 'text-green-500' },
          { label: 'Existing', value: visitors.filter(v => v.is_existing_contact).length, icon: UserCheck, color: 'text-amber-500' },
          { label: 'Uncontacted', value: visitors.filter(v => v.follow_up_status === 'uncontacted').length, icon: Clock, color: 'text-red-500' },
          { label: 'Hot Leads', value: hotCount, icon: Flame, color: 'text-red-500' },
          { label: 'Repeat', value: repeatCount, icon: Repeat, color: 'text-purple-500' },
        ].map(s => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-3 text-center">
              <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Follow-up Drafts */}
      {followUpDrafts.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI-Generated Follow-Ups ({followUpDrafts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {followUpDrafts.map(d => (
              <div key={d.visitor_id} className="border border-border/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.visitor_name}</span>
                    <Badge variant={d.priority === 'high' ? 'destructive' : d.priority === 'medium' ? 'default' : 'secondary'} className="text-[9px]">
                      {d.priority}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setExpandedDraft(expandedDraft === d.visitor_id ? null : d.visitor_id)}>
                    {expandedDraft === d.visitor_id ? 'Collapse' : 'Preview'}
                  </Button>
                </div>
                {expandedDraft === d.visitor_id && (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs">
                      <span className="text-muted-foreground">To:</span> {d.visitor_email || 'No email'}
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Subject:</span> {d.subject}
                    </div>
                    <div className="text-xs bg-background/80 rounded p-2 whitespace-pre-wrap">{d.body}</div>
                    {d.visitor_email && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          window.open(`mailto:${d.visitor_email}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`);
                        }}
                      >
                        <Mail className="h-3 w-3" /> Open in Email
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Visitor Cards */}
      {sorted.length === 0 ? (
        <EmptyState title="No Visitors Yet" description="Visitors will appear here once they scan and submit." icon={<Users className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-2">
          {sorted.map(v => {
            const responses = v.responses as Record<string, any>;
            return (
              <Card
                key={v.id}
                className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelectedVisitor(v)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Intent indicator */}
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      v.intent.label === 'Hot' ? 'bg-red-500/10 text-red-500' :
                      v.intent.label === 'Warm' ? 'bg-amber-500/10 text-amber-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {v.intent.label === 'Hot' ? <Flame className="h-5 w-5" /> :
                       <span className="text-sm font-bold">{v.intent.score}</span>}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{v.full_name}</span>
                        <Badge variant={v.is_existing_contact ? 'secondary' : 'default'} className="text-[9px] shrink-0">
                          {v.is_existing_contact ? 'Existing' : 'New'}
                        </Badge>
                        {v.follow_up_status === 'uncontacted' && (
                          <Badge variant="destructive" className="text-[9px] shrink-0">Needs Follow-up</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {v.email && (
                          <a
                            href={`mailto:${v.email}`}
                            className="hover:text-primary transition-colors truncate"
                            onClick={e => e.stopPropagation()}
                          >
                            <Mail className="h-3 w-3 inline mr-1" />{v.email}
                          </a>
                        )}
                        {v.phone && (
                          <a
                            href={`tel:${v.phone}`}
                            className="hover:text-primary transition-colors shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3 inline mr-1" />{v.phone}
                          </a>
                        )}
                      </div>
                      {v.crossEvent && (
                        <div className="flex items-center gap-1 mt-1">
                          <Repeat className="h-3 w-3 text-purple-500" />
                          <span className="text-[10px] text-purple-500 font-medium">{v.crossEvent.visitCount} visits</span>
                          {v.crossEvent.narrowingPattern && (
                            <span className="text-[9px] text-muted-foreground">• {v.crossEvent.narrowingPattern}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right side */}
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), 'MMM d')}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), 'h:mm a')}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 ml-auto" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Visitor Detail Sheet */}
      <Sheet open={!!selectedVisitor} onOpenChange={(open) => !open && setSelectedVisitor(null)}>
        <SheetContent className="overflow-y-auto">
          {selectedVisitor && (
            <VisitorDetail visitor={selectedVisitor} onClose={() => setSelectedVisitor(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function VisitorDetail({ visitor, onClose }: { visitor: any; onClose: () => void }) {
  const responses = visitor.responses as Record<string, any>;
  const responseEntries = Object.entries(responses).filter(([k]) => !['full_name', 'email', 'phone'].includes(k));

  return (
    <div className="space-y-6 pt-2">
      <SheetHeader>
        <SheetTitle className="text-left">{visitor.full_name}</SheetTitle>
      </SheetHeader>

      {/* Contact Info */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</p>
        {visitor.email && (
          <a
            href={`mailto:${visitor.email}`}
            className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
          >
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm">{visitor.email}</span>
          </a>
        )}
        {visitor.phone && (
          <a
            href={`tel:${visitor.phone}`}
            className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
          >
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm">{visitor.phone}</span>
          </a>
        )}
      </div>

      {/* Property */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property Visited</p>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-sm">{visitor.open_houses?.property_address || '—'}</span>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant={visitor.is_existing_contact ? 'secondary' : 'default'}>
            {visitor.is_existing_contact ? 'Existing Contact' : 'New Lead'}
          </Badge>
          <Badge variant={visitor.follow_up_status === 'uncontacted' ? 'destructive' : 'secondary'}>
            {visitor.follow_up_status === 'uncontacted' ? 'Needs Follow-up' : visitor.follow_up_status}
          </Badge>
          {visitor.intent && (
            <Badge variant={visitor.intent.label === 'Hot' ? 'destructive' : visitor.intent.label === 'Warm' ? 'default' : 'secondary'}>
              Intent: {visitor.intent.score} • {visitor.intent.label}
            </Badge>
          )}
          {visitor.fub_match_status && visitor.fub_match_status !== 'no_integration' && (
            <Badge variant="outline">FUB: {visitor.fub_match_status}</Badge>
          )}
        </div>
      </div>

      {/* Intent Reasons */}
      {visitor.intent?.reasons?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Intent Signals</p>
          <div className="space-y-1">
            {visitor.intent.reasons.map((r: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-primary">•</span> {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-event */}
      {visitor.crossEvent?.isRepeatVisitor && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cross-Event Activity</p>
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Repeat className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-500">{visitor.crossEvent.visitCount} total visits</span>
            </div>
            {visitor.crossEvent.narrowingPattern && (
              <p className="text-xs text-muted-foreground">{visitor.crossEvent.narrowingPattern}</p>
            )}
          </div>
        </div>
      )}

      {/* Form Responses */}
      {responseEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Form Responses</p>
          <div className="space-y-2">
            {responseEntries.map(([key, value]) => (
              <div key={key} className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="text-sm">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        Signed in {format(new Date(visitor.created_at), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
      </div>
    </div>
  );
}
