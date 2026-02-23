import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, UserPlus, DollarSign, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export function OpenHouseInsights() {
  const { user } = useAuth();

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
      const { data, error } = await supabase.from('open_house_visitors').select('*');
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
  const existingContacts = visitors.filter(v => v.is_existing_contact).length;
  const uncontacted = visitors.filter(v => v.follow_up_status === 'uncontacted').length;

  // Estimate pipeline value from price_range responses
  const priceMap: Record<string, number> = {
    'Under $200K': 150000,
    '$200K-$400K': 300000,
    '$400K-$600K': 500000,
    '$600K-$800K': 700000,
    '$800K-$1M': 900000,
    '$1M+': 1200000,
  };

  let estimatedPipeline = 0;
  visitors.forEach(v => {
    const resp = v.responses as Record<string, any>;
    if (resp?.price_range && priceMap[resp.price_range]) {
      estimatedPipeline += priceMap[resp.price_range] * 0.03; // 3% commission estimate
    }
  });

  // Per-open-house breakdown
  const byHouse = openHouses.map(oh => {
    const houseVisitors = visitors.filter(v => v.open_house_id === oh.id);
    return {
      ...oh,
      totalVisitors: houseVisitors.length,
      newLeads: houseVisitors.filter(v => !v.is_existing_contact).length,
      existingContacts: houseVisitors.filter(v => v.is_existing_contact).length,
      uncontacted: houseVisitors.filter(v => v.follow_up_status === 'uncontacted').length,
    };
  });

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">${Math.round(estimatedPipeline / 1000)}K</p>
            <p className="text-xs text-muted-foreground">Est. Commission</p>
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
                <span className="text-sm truncate">{oh.property_address}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px]">{oh.totalVisitors} visitors</Badge>
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
            <CardTitle className="text-sm text-destructive">⚡ Follow-up Priorities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visitors.filter(v => v.follow_up_status === 'uncontacted').slice(0, 5).map(v => {
                const resp = v.responses as Record<string, any>;
                return (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{v.full_name}</span>
                    <div className="flex gap-1">
                      {resp?.buy_timeline && resp.buy_timeline !== 'Just browsing' && (
                        <Badge variant="secondary" className="text-[9px]">Buyer: {resp.buy_timeline}</Badge>
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
