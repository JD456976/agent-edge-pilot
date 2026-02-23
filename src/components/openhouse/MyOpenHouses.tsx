import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MapPin, Calendar, Users, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';

interface Props {
  onEdit: (id: string) => void;
  onViewQR: (id: string) => void;
}

export function MyOpenHouses({ onEdit, onViewQR }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: openHouses = [], isLoading } = useQuery({
    queryKey: ['open-houses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_houses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: visitorCounts = {} } = useQuery({
    queryKey: ['open-house-visitor-counts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_house_visitors')
        .select('open_house_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach(v => { counts[v.open_house_id] = (counts[v.open_house_id] || 0) + 1; });
      return counts;
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('open_houses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-houses'] });
      toast.success('Open house deleted');
    },
  });

  if (isLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)}</div>;
  }

  if (openHouses.length === 0) {
    return <EmptyState title="No Open Houses Yet" description="Create your first open house intake to start capturing visitors." icon={<Plus className="h-8 w-8" />} />;
  }

  return (
    <div className="grid gap-3">
      {openHouses.map(oh => (
        <Card key={oh.id} className="border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="font-semibold text-sm truncate">{oh.property_address}</h3>
                  <Badge variant={oh.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                    {oh.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  {oh.event_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(oh.event_date), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {visitorCounts[oh.id] || 0} visitors
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewQR(oh.id)}>
                  <span className="text-xs">QR</span>
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(oh.id)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(oh.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
