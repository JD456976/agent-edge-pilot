import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, MapPin, Calendar, Users, Edit, Trash2, ToggleLeft, ToggleRight, Copy, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';

interface Props {
  onEdit: (id: string) => void;
  onViewQR: (id: string) => void;
  onViewReport?: (id: string) => void;
}

export function MyOpenHouses({ onEdit, onViewQR, onViewReport }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; address: string } | null>(null);

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
      // Delete fields and visitors first, then the open house
      await supabase.from('open_house_fields').delete().eq('open_house_id', id);
      await supabase.from('open_house_visitors').delete().eq('open_house_id', id);
      const { error } = await supabase.from('open_houses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-houses'] });
      queryClient.invalidateQueries({ queryKey: ['open-house-visitor-counts'] });
      toast.success('Open house deleted');
      setDeleteTarget(null);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase.from('open_houses').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['open-houses'] });
      toast.success(`Open house ${vars.newStatus === 'active' ? 'activated' : 'closed'}`);
    },
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/visit/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Sign-in link copied to clipboard!');
  };

  if (isLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)}</div>;
  }

  if (openHouses.length === 0) {
    return <EmptyState title="No Open Houses Yet" description="Create your first open house intake to start capturing visitors." icon={<Plus className="h-8 w-8" />} />;
  }

  return (
    <>
      <div className="grid gap-3">
        {openHouses.map(oh => {
          const count = visitorCounts[oh.id] || 0;
          const role = (oh as any).agent_role;
          return (
            <Card key={oh.id} className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-semibold text-sm truncate">{oh.property_address}</h3>
                      <Badge variant={oh.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                        {oh.status}
                      </Badge>
                      {role && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {role === 'listing_agent' ? '🏠 Listing Agent' : '🤝 Facilitator'}
                        </Badge>
                      )}
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
                        {count} visitor{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Copy sign-in link" onClick={() => copyLink(oh.intake_token)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="QR Code" onClick={() => onViewQR(oh.id)}>
                      <span className="text-xs">QR</span>
                    </Button>
                    {count > 0 && onViewReport && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Visitor Report" onClick={() => onViewReport(oh.id)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => onEdit(oh.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={oh.status === 'active' ? 'Close open house' : 'Reactivate'}
                      onClick={() => toggleStatusMutation.mutate({ id: oh.id, newStatus: oh.status === 'active' ? 'closed' : 'active' })}
                    >
                      {oh.status === 'active' ? <ToggleRight className="h-3.5 w-3.5 text-green-500" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setDeleteTarget({ id: oh.id, address: oh.property_address })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Open House</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.address}</strong>? This will permanently remove all visitor data and form fields associated with it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Forever'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
