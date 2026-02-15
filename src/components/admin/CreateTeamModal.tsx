import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, X, Loader2, Crown, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TeamRole } from '@/types';
import { TEAM_ROLE_LABELS } from '@/types';

interface ProfileOption {
  userId: string;
  name: string;
  email: string;
}

interface SelectedMember {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
}

interface Props {
  organizations: { id: string; name: string }[];
  availableUsers: ProfileOption[];
  defaultOrgId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTeamModal({ organizations, availableUsers, defaultOrgId, onClose, onCreated }: Props) {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState('');
  const [orgId, setOrgId] = useState(defaultOrgId || organizations[0]?.id || '');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>(() => {
    // Auto-add creator as Leader
    const creator = availableUsers.find(u => u.userId === user?.id);
    if (creator) {
      return [{ userId: creator.userId, name: creator.name, email: creator.email, role: 'leader' }];
    }
    return [];
  });
  const [submitting, setSubmitting] = useState(false);

  const filteredUsers = useMemo(() => {
    const selectedIds = new Set(selectedMembers.map(m => m.userId));
    const q = memberSearch.toLowerCase();
    return availableUsers.filter(u =>
      !selectedIds.has(u.userId) &&
      (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [availableUsers, selectedMembers, memberSearch]);

  const addMember = (u: ProfileOption) => {
    setSelectedMembers(prev => [...prev, { ...u, role: 'agent' }]);
    setMemberSearch('');
  };

  const removeMember = (userId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.userId !== userId));
  };

  const changeMemberRole = (userId: string, role: TeamRole) => {
    setSelectedMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m));
  };

  const handleCreate = async () => {
    if (!teamName.trim() || !orgId) return;
    setSubmitting(true);

    try {
      const leaderMember = selectedMembers.find(m => m.role === 'leader');

      // Create team
      const { data: team, error: teamErr } = await supabase.from('teams').insert({
        name: teamName.trim(),
        organization_id: orgId,
        team_leader_user_id: leaderMember?.userId || user!.id,
      }).select().single();

      if (teamErr) throw teamErr;

      // Create team_members rows
      if (selectedMembers.length > 0) {
        const memberInserts = selectedMembers.map(m => ({
          team_id: team.id,
          user_id: m.userId,
          role: m.role as any,
        }));
        const { error: membersErr } = await supabase.from('team_members').insert(memberInserts);
        if (membersErr) throw membersErr;
      }

      // Audit
      await logAdminAction('team_created', {
        teamId: team.id,
        teamName: teamName.trim(),
        organizationId: orgId,
        memberCount: selectedMembers.length,
      });
      if (selectedMembers.length > 0) {
        await logAdminAction('team_members_added', {
          teamId: team.id,
          members: selectedMembers.map(m => ({ userId: m.userId, role: m.role })),
        });
      }

      toast({ title: 'Team created', description: `${teamName} created with ${selectedMembers.length} member(s)` });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed to create team', description: err.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const hasLeader = selectedMembers.some(m => m.role === 'leader');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Team</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Team Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Team Name *</Label>
            <Input
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="e.g. Listing Team"
              autoFocus
            />
          </div>

          {/* Organization */}
          <div className="space-y-1.5">
            <Label className="text-xs">Organization</Label>
            {organizations.length === 1 ? (
              <Input value={organizations[0].name} disabled className="opacity-60" />
            ) : (
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  {organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Members */}
          <div className="space-y-2">
            <Label className="text-xs">Members</Label>

            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {selectedMembers.map(m => (
                  <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {m.role === 'leader' ? (
                        <Crown className="h-3.5 w-3.5 text-warning shrink-0" />
                      ) : (
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.name || m.email}</p>
                        {m.name && <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Select value={m.role} onValueChange={(v) => changeMemberRole(m.userId, v as TeamRole)}>
                        <SelectTrigger className="h-7 w-[100px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leader">Leader</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="isa">ISA</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMember(m.userId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search + add */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users to add..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {memberSearch && filteredUsers.length > 0 && (
              <div className="border border-border rounded-lg max-h-32 overflow-y-auto">
                {filteredUsers.slice(0, 10).map(u => (
                  <button
                    key={u.userId}
                    className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors text-left"
                    onClick={() => addMember(u)}
                  >
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{u.name || u.email}</p>
                      {u.name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {memberSearch && filteredUsers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No matching users found</p>
            )}

            {!hasLeader && selectedMembers.length > 0 && (
              <p className="text-xs text-warning">⚠ Team should have at least one Leader</p>
            )}

            <p className="text-[10px] text-muted-foreground">Leaders can manage team defaults later</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!teamName.trim() || !orgId || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
