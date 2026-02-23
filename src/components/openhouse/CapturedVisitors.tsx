import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, UserCheck, UserPlus, Clock, Flame, Sparkles, Repeat, Loader2, Mail } from 'lucide-react';
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

  // All visitors for cross-event analysis
  const { data: allVisitors = [] } = useQuery({
    queryKey: ['oh-all-visitors-cross', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_house_visitors').select('*, open_houses!inner(property_address)');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Realtime subscription for live visitor alerts
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

  // Compute intent scores and cross-event insights
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

  // Sort by intent score descending
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
        // Store drafts in state for display
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

      {sorted.length === 0 ? (
        <EmptyState title="No Visitors Yet" description="Visitors will appear here once they scan and submit." icon={<Users className="h-8 w-8" />} />
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Intent</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Email</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Property</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Signals</TableHead>
                <TableHead className="text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(v => {
                const responses = v.responses as Record<string, any>;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm font-medium">
                      <div>
                        {v.full_name}
                        {v.crossEvent && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Repeat className="h-3 w-3 text-purple-500" />
                            <span className="text-[10px] text-purple-500 font-medium">
                              {v.crossEvent.visitCount} visits
                            </span>
                            {v.crossEvent.narrowingPattern && (
                              <span className="text-[9px] text-muted-foreground">• {v.crossEvent.narrowingPattern}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {v.intent.label === 'Hot' && <Flame className="h-3.5 w-3.5 text-red-500" />}
                        <Badge 
                          variant={v.intent.label === 'Hot' ? 'destructive' : v.intent.label === 'Warm' ? 'default' : 'secondary'} 
                          className="text-[10px]"
                        >
                          {v.intent.score} • {v.intent.label}
                        </Badge>
                      </div>
                      {v.intent.reasons.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-0.5 max-w-28 truncate">
                          {v.intent.reasons.join(', ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant={v.is_existing_contact ? 'secondary' : 'default'} className="text-[10px]">
                          {v.is_existing_contact ? 'Existing' : 'New'}
                        </Badge>
                        {v.follow_up_status === 'uncontacted' && (
                          <Badge variant="destructive" className="text-[10px]">Needs Follow-up</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{v.email || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell truncate max-w-32">
                      {(v as any).open_houses?.property_address || '—'}
                    </TableCell>
                    <TableCell className="text-xs hidden md:table-cell">
                      <div className="flex flex-wrap gap-0.5">
                        {responses.buy_timeline && <Badge variant="outline" className="text-[9px]">{responses.buy_timeline}</Badge>}
                        {responses.price_range && <Badge variant="outline" className="text-[9px]">{responses.price_range}</Badge>}
                        {responses.working_with_agent === 'No' && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-600">No Agent</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(v.created_at), 'MMM d, h:mm a')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
