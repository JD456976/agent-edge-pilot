import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Download, MapPin, Users, UserPlus, Flame, Clock, BarChart3, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { scoreVisitorIntent } from '@/lib/visitorIntentScoring';

interface Props {
  openHouseId: string;
  onBack: () => void;
}

export function VisitorReport({ openHouseId, onBack }: Props) {
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: openHouse } = useQuery({
    queryKey: ['oh-report-house', openHouseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_houses').select('*').eq('id', openHouseId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!openHouseId,
  });

  const { data: visitors = [] } = useQuery({
    queryKey: ['oh-report-visitors', openHouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_house_visitors')
        .select('*')
        .eq('open_house_id', openHouseId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!openHouseId,
  });

  if (!openHouse) return null;

  const scored = visitors.map(v => ({
    ...v,
    intent: scoreVisitorIntent(v.responses as Record<string, any>, !!v.email, !!v.phone),
  }));

  const totalVisitors = scored.length;
  const newLeads = scored.filter(v => !v.is_existing_contact).length;
  const hotLeads = scored.filter(v => v.intent.label === 'Hot').length;
  const warmLeads = scored.filter(v => v.intent.label === 'Warm').length;
  const uncontacted = scored.filter(v => v.follow_up_status === 'uncontacted').length;
  const withEmail = scored.filter(v => !!v.email).length;
  const withPhone = scored.filter(v => !!v.phone).length;
  const noAgent = scored.filter(v => (v.responses as any)?.working_with_agent === 'No').length;
  const avgScore = totalVisitors ? Math.round(scored.reduce((s, v) => s + v.intent.score, 0) / totalVisitors) : 0;

  // Timeline distribution
  const timelineCounts: Record<string, number> = {};
  scored.forEach(v => {
    const t = (v.responses as any)?.buy_timeline;
    if (t) timelineCounts[t] = (timelineCounts[t] || 0) + 1;
  });

  // Price range distribution
  const priceCounts: Record<string, number> = {};
  scored.forEach(v => {
    const p = (v.responses as any)?.price_range;
    if (p) priceCounts[p] = (priceCounts[p] || 0) + 1;
  });

  // Property type distribution
  const typeCounts: Record<string, number> = {};
  scored.forEach(v => {
    const t = (v.responses as any)?.property_type;
    if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  const agentRole = (openHouse as any).agent_role;

  const handlePrint = () => {
    window.print();
  };

  const maxBarValue = (counts: Record<string, number>) => Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1 text-xs">
          <Printer className="h-3.5 w-3.5" /> Print Report
        </Button>
      </div>

      <div ref={reportRef} className="space-y-4 print:space-y-6">
        {/* Header */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 text-center space-y-2">
            <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground">Open House Intelligence Report</p>
            <h1 className="text-xl font-bold flex items-center justify-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {openHouse.property_address}
            </h1>
            {openHouse.event_date && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(openHouse.event_date), 'EEEE, MMMM d, yyyy · h:mm a')}
              </p>
            )}
            {agentRole && (
              <Badge variant="outline" className="text-xs">
                {agentRole === 'listing_agent' ? '🏠 Listing Agent' : '🤝 Facilitator'}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Visitors', value: totalVisitors, icon: Users, color: 'text-primary' },
            { label: 'New Leads', value: newLeads, icon: UserPlus, color: 'text-green-600' },
            { label: 'Hot Leads', value: hotLeads, icon: Flame, color: 'text-red-500' },
            { label: 'Avg Intent Score', value: avgScore, icon: BarChart3, color: 'text-primary' },
          ].map(m => (
            <Card key={m.label} className="border-border/50">
              <CardContent className="p-4 text-center">
                <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
                <p className="text-2xl font-bold">{m.value}</p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Secondary Metrics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Capture Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              {[
                { label: 'With Email', value: withEmail, pct: totalVisitors ? Math.round((withEmail / totalVisitors) * 100) : 0 },
                { label: 'With Phone', value: withPhone, pct: totalVisitors ? Math.round((withPhone / totalVisitors) * 100) : 0 },
                { label: 'No Agent', value: noAgent, pct: totalVisitors ? Math.round((noAgent / totalVisitors) * 100) : 0 },
                { label: 'Warm Leads', value: warmLeads, pct: totalVisitors ? Math.round((warmLeads / totalVisitors) * 100) : 0 },
                { label: 'Need Follow-up', value: uncontacted, pct: totalVisitors ? Math.round((uncontacted / totalVisitors) * 100) : 0 },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-lg font-bold">{m.value}</p>
                  <p className="text-[10px] text-muted-foreground">{m.label} ({m.pct}%)</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Intent Distribution Bar */}
        {totalVisitors > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Intent Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-6 rounded-full overflow-hidden bg-muted">
                {hotLeads > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(hotLeads / totalVisitors) * 100}%` }} />}
                {warmLeads > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(warmLeads / totalVisitors) * 100}%` }} />}
                <div className="bg-blue-400/30 h-full flex-1" />
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Hot {hotLeads}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Warm {warmLeads}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400/30 inline-block" /> Cool/Browser {totalVisitors - hotLeads - warmLeads}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Distribution Charts */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(timelineCounts).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Buy Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(timelineCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${(count / maxBarValue(timelineCounts)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {Object.keys(priceCounts).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Price Range</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(priceCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-amber-500/60 rounded-full transition-all" style={{ width: `${(count / maxBarValue(priceCounts)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {Object.keys(typeCounts).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Property Type Interest</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <Badge key={label} variant="outline" className="text-xs py-1.5 px-3">
                    {label} <span className="ml-1 font-bold">{count}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Leads Table */}
        {scored.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Visitor List (Ranked by Intent)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Name</th>
                      <th className="p-2 text-left font-medium">Intent</th>
                      <th className="p-2 text-left font-medium hidden sm:table-cell">Email</th>
                      <th className="p-2 text-left font-medium hidden sm:table-cell">Phone</th>
                      <th className="p-2 text-left font-medium hidden md:table-cell">Timeline</th>
                      <th className="p-2 text-left font-medium hidden md:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...scored].sort((a, b) => b.intent.score - a.intent.score).map((v, i) => {
                      const resp = v.responses as Record<string, any>;
                      return (
                        <tr key={v.id} className="border-t border-border/50">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2 font-medium">{v.full_name}</td>
                          <td className="p-2">
                            <Badge
                              variant={v.intent.label === 'Hot' ? 'destructive' : v.intent.label === 'Warm' ? 'default' : 'secondary'}
                              className="text-[9px]"
                            >
                              {v.intent.score} · {v.intent.label}
                            </Badge>
                          </td>
                          <td className="p-2 hidden sm:table-cell text-muted-foreground">{v.email || '—'}</td>
                          <td className="p-2 hidden sm:table-cell text-muted-foreground">{v.phone || '—'}</td>
                          <td className="p-2 hidden md:table-cell text-muted-foreground">{resp?.buy_timeline || '—'}</td>
                          <td className="p-2 hidden md:table-cell">
                            <Badge variant={v.is_existing_contact ? 'secondary' : 'default'} className="text-[9px]">
                              {v.is_existing_contact ? 'Existing' : 'New'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-[10px] text-muted-foreground py-4 print:py-8">
          <p>Generated {format(new Date(), 'MMMM d, yyyy · h:mm a')}</p>
          <p className="mt-0.5">Agent Edge Pilot · Open House Intelligence</p>
        </div>
      </div>
    </div>
  );
}
