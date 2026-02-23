import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, UserCheck, UserPlus, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState } from '@/components/EmptyState';

export function CapturedVisitors() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [selectedHouse, setSelectedHouse] = useState('all');

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

  const filtered = visitors.filter(v => {
    if (filter === 'new') return !v.is_existing_contact;
    if (filter === 'existing') return v.is_existing_contact;
    if (filter === 'uncontacted') return v.follow_up_status === 'uncontacted';
    return true;
  });

  if (isLoading) return <div className="h-40 bg-muted/50 rounded-lg animate-pulse" />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
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
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: visitors.length, icon: Users, color: 'text-primary' },
          { label: 'New', value: visitors.filter(v => !v.is_existing_contact).length, icon: UserPlus, color: 'text-green-500' },
          { label: 'Existing', value: visitors.filter(v => v.is_existing_contact).length, icon: UserCheck, color: 'text-amber-500' },
          { label: 'Uncontacted', value: visitors.filter(v => v.follow_up_status === 'uncontacted').length, icon: Clock, color: 'text-red-500' },
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

      {filtered.length === 0 ? (
        <EmptyState title="No Visitors Yet" description="Visitors will appear here once they scan and submit." icon={<Users className="h-8 w-8" />} />
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Email</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Property</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Responses</TableHead>
                <TableHead className="text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(v => {
                const responses = v.responses as Record<string, any>;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm font-medium">{v.full_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
                      {responses.buy_timeline && <Badge variant="outline" className="text-[9px] mr-1">{responses.buy_timeline}</Badge>}
                      {responses.price_range && <Badge variant="outline" className="text-[9px]">{responses.price_range}</Badge>}
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
