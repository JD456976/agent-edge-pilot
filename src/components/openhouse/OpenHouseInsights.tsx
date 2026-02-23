import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Users, UserPlus, DollarSign, MapPin, Flame, Repeat, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { scoreVisitorIntent, analyzeCrossEventVisitor } from '@/lib/visitorIntentScoring';
import { format } from 'date-fns';

export function OpenHouseInsights() {
  const { user } = useAuth();
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  const { data: openHouses = [] } = useQuery({
    queryKey: ['open-houses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_houses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: visitors = [] } = useQuery({
    queryKey: ['oh-all-visitors', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_house_visitors').select('*, open_houses!inner(property_address)');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (openHouses.length === 0) {
    return <EmptyState title="No Data Yet" description="Insights will populate once you run open houses and capture visitors." icon={<TrendingUp className="h-8 w-8" />} />;
  }

  const totalVisitors = visitors.length;
  const newLeads = visitors.filter(v => !v.is_existing_contact).length;
  const uncontacted = visitors.filter(v => v.follow_up_status === 'uncontacted').length;

  // Intent scoring across all visitors
  const allScores = visitors.map(v => scoreVisitorIntent(v.responses as Record<string, any>, !!v.email, !!v.phone));
  const hotLeads = allScores.filter(s => s.label === 'Hot').length;
  const warmLeads = allScores.filter(s => s.label === 'Warm').length;

  // Cross-event repeat visitors
  const emailsSeen = new Set<string>();
  const repeatVisitors: string[] = [];
  visitors.forEach(v => {
    if (v.email) {
      if (emailsSeen.has(v.email.toLowerCase())) {
        if (!repeatVisitors.includes(v.email.toLowerCase())) repeatVisitors.push(v.email.toLowerCase());
      }
      emailsSeen.add(v.email.toLowerCase());
    }
  });

  // Pipeline estimate
  const priceMap: Record<string, number> = {
    'Under $200K': 150000, '$200K-$400K': 300000, '$400K-$600K': 500000,
    '$600K-$800K': 700000, '$800K-$1M': 900000, '$1M+': 1200000,
  };
  let estimatedPipeline = 0;
  visitors.forEach(v => {
    const resp = v.responses as Record<string, any>;
    if (resp?.price_range && priceMap[resp.price_range]) {
      estimatedPipeline += priceMap[resp.price_range] * 0.03;
    }
  });

  // Per-house stats
  const byHouse = openHouses.map(oh => {
    const hv = visitors.filter(v => v.open_house_id === oh.id);
    const scores = hv.map(v => scoreVisitorIntent(v.responses as Record<string, any>, !!v.email, !!v.phone));
    const avgScore = scores.length ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length) : 0;
    return {
      ...oh,
      totalVisitors: hv.length,
      newLeads: hv.filter(v => !v.is_existing_contact).length,
      hotLeads: scores.filter(s => s.label === 'Hot').length,
      warmLeads: scores.filter(s => s.label === 'Warm').length,
      uncontacted: hv.filter(v => v.follow_up_status === 'uncontacted').length,
      avgScore,
      newLeadPct: hv.length ? Math.round((hv.filter(v => !v.is_existing_contact).length / hv.length) * 100) : 0,
    };
  });

  // Averages across all open houses
  const avgVisitors = openHouses.length ? Math.round(totalVisitors / openHouses.length) : 0;
  const avgNewPct = totalVisitors ? Math.round((newLeads / totalVisitors) * 100) : 0;
  const avgIntentScore = allScores.length ? Math.round(allScores.reduce((s, sc) => s + sc.score, 0) / allScores.length) : 0;

  // Comparison
  const houseA = compareA ? byHouse.find(h => h.id === compareA) : null;
  const houseB = compareB ? byHouse.find(h => h.id === compareB) : null;

  const ComparisonArrow = ({ a, b }: { a: number; b: number }) => {
    if (a > b) return <ArrowUpRight className="h-3 w-3 text-green-500" />;
    if (a < b) return <ArrowDownRight className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{totalVisitors}</p>
            <p className="text-xs text-muted-foreground">Total Visitors</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <UserPlus className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{newLeads}</p>
            <p className="text-xs text-muted-foreground">New Leads</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <Flame className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-2xl font-bold">{hotLeads}</p>
            <p className="text-xs text-muted-foreground">Hot Leads</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">${Math.round(estimatedPipeline / 1000)}K</p>
            <p className="text-xs text-muted-foreground">Est. Commission</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <Repeat className="h-5 w-5 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold">{repeatVisitors.length}</p>
            <p className="text-xs text-muted-foreground">Repeat Visitors</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-red-500" />
            <p className="text-2xl font-bold">{uncontacted}</p>
            <p className="text-xs text-muted-foreground">Need Follow-up</p>
          </CardContent>
        </Card>
      </div>

      {/* Intent Distribution */}
      {totalVisitors > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Visitor Intent Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden flex">
                {hotLeads > 0 && <div className="h-full bg-red-500" style={{ width: `${(hotLeads / totalVisitors) * 100}%` }} />}
                {warmLeads > 0 && <div className="h-full bg-amber-500" style={{ width: `${(warmLeads / totalVisitors) * 100}%` }} />}
                {(totalVisitors - hotLeads - warmLeads) > 0 && (
                  <div className="h-full bg-blue-500/30" style={{ width: `${((totalVisitors - hotLeads - warmLeads) / totalVisitors) * 100}%` }} />
                )}
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-red-500" /> Hot {hotLeads} ({Math.round((hotLeads / totalVisitors) * 100)}%)</span>
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-amber-500" /> Warm {warmLeads} ({Math.round((warmLeads / totalVisitors) * 100)}%)</span>
              <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-blue-500/30" /> Cool/Browser {totalVisitors - hotLeads - warmLeads}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New vs Existing ratio */}
      {totalVisitors > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New vs Existing Split</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(newLeads / totalVisitors) * 100}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{Math.round((newLeads / totalVisitors) * 100)}% new</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repeat Visitor Intelligence */}
      {repeatVisitors.length > 0 && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Repeat className="h-4 w-4 text-purple-500" />
              Cross-Event Intelligence ({repeatVisitors.length} repeat visitors)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {repeatVisitors.slice(0, 5).map(email => {
              const insight = analyzeCrossEventVisitor(email, visitors as any);
              if (!insight) return null;
              const matchName = visitors.find(v => v.email?.toLowerCase() === email)?.full_name;
              return (
                <div key={email} className="flex items-center justify-between text-sm border-b border-border/30 last:border-0 pb-2 last:pb-0">
                  <div>
                    <span className="font-medium">{matchName}</span>
                    <div className="text-[10px] text-muted-foreground">
                      {insight.visitCount} visits across {insight.properties.length} properties
                    </div>
                    {insight.narrowingPattern && (
                      <div className="text-[10px] text-purple-500">{insight.narrowingPattern}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px]">
                    Avg Intent: {insight.avgIntentScore}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Post-Event Comparison */}
      {openHouses.length >= 2 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Compare Open Houses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={compareA} onValueChange={setCompareA}>
                <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Select Open House A" /></SelectTrigger>
                <SelectContent>
                  {openHouses.map(oh => (
                    <SelectItem key={oh.id} value={oh.id}>{oh.property_address}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground self-center">vs</span>
              <Select value={compareB} onValueChange={setCompareB}>
                <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Select Open House B" /></SelectTrigger>
                <SelectContent>
                  {openHouses.map(oh => (
                    <SelectItem key={oh.id} value={oh.id}>{oh.property_address}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {houseA && houseB && (
              <div className="rounded-lg border border-border">
                <div className="grid grid-cols-3 text-xs">
                  <div className="p-2 font-medium border-b border-border bg-muted/50">Metric</div>
                  <div className="p-2 font-medium border-b border-l border-border bg-muted/50 truncate">{houseA.property_address}</div>
                  <div className="p-2 font-medium border-b border-l border-border bg-muted/50 truncate">{houseB.property_address}</div>

                  {[
                    { metric: 'Total Visitors', a: houseA.totalVisitors, b: houseB.totalVisitors },
                    { metric: 'New Leads', a: houseA.newLeads, b: houseB.newLeads },
                    { metric: 'Hot Leads', a: houseA.hotLeads, b: houseB.hotLeads },
                    { metric: 'New Lead %', a: houseA.newLeadPct, b: houseB.newLeadPct, suffix: '%' },
                    { metric: 'Avg Intent Score', a: houseA.avgScore, b: houseB.avgScore },
                    { metric: 'Uncontacted', a: houseA.uncontacted, b: houseB.uncontacted },
                  ].map(row => (
                    <React.Fragment key={row.metric}>
                      <div className="p-2 border-b border-border text-muted-foreground">{row.metric}</div>
                      <div className="p-2 border-b border-l border-border flex items-center gap-1">
                        <ComparisonArrow a={row.a} b={row.b} />
                        {row.a}{row.suffix || ''}
                      </div>
                      <div className="p-2 border-b border-l border-border flex items-center gap-1">
                        <ComparisonArrow a={row.b} b={row.a} />
                        {row.b}{row.suffix || ''}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Averages */}
            <div className="flex gap-3 text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2">
              <span>📊 Your Averages:</span>
              <span>{avgVisitors} visitors/event</span>
              <span>{avgNewPct}% new leads</span>
              <span>Avg intent: {avgIntentScore}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-house breakdown */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By Open House</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byHouse.map(oh => (
            <div key={oh.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm truncate block">{oh.property_address}</span>
                  <span className="text-[10px] text-muted-foreground">
                    Avg Intent: {oh.avgScore} • {oh.newLeadPct}% new
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px]">{oh.totalVisitors} visitors</Badge>
                {oh.hotLeads > 0 && <Badge variant="destructive" className="text-[10px]">{oh.hotLeads} 🔥</Badge>}
                <Badge variant="default" className="text-[10px]">{oh.newLeads} new</Badge>
                {oh.uncontacted > 0 && <Badge variant="destructive" className="text-[10px]">{oh.uncontacted} pending</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Follow-up priorities */}
      {uncontacted > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">⚡ Follow-up Priorities (by intent score)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visitors
                .filter(v => v.follow_up_status === 'uncontacted')
                .map(v => ({ ...v, intent: scoreVisitorIntent(v.responses as Record<string, any>, !!v.email, !!v.phone) }))
                .sort((a, b) => b.intent.score - a.intent.score)
                .slice(0, 8)
                .map(v => {
                  const resp = v.responses as Record<string, any>;
                  return (
                    <div key={v.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {v.intent.label === 'Hot' && <Flame className="h-3 w-3 text-red-500" />}
                        <span className="font-medium">{v.full_name}</span>
                        <Badge variant={v.intent.label === 'Hot' ? 'destructive' : 'secondary'} className="text-[9px]">
                          {v.intent.score} {v.intent.label}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {resp?.buy_timeline && resp.buy_timeline !== 'Just browsing' && (
                          <Badge variant="secondary" className="text-[9px]">{resp.buy_timeline}</Badge>
                        )}
                        {resp?.working_with_agent === 'No' && (
                          <Badge variant="default" className="text-[9px]">No Agent</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
