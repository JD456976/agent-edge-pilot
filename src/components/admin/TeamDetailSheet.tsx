import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, Trash2, Crown, UserIcon, Pencil, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TeamRole } from '@/types';
import { TEAM_ROLE_LABELS } from '@/types';

interface TeamMemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  teamRole: TeamRole;
  appRole: string;
  status: string;
  isProtected: boolean;
}

interface ProfileOption {
  userId: string;
  name: string;
  email: string;
}

interface Props {
  teamId: string;
  teamName: string;
  orgName: string;
  createdAt: string;
  availableUsers: ProfileOption[];
  onClose: () => void;
  onClose: () => void;
  onChanged: () => void;
}

export function TeamDetailSheet({ teamId, teamName: initialName, orgName, createdAt, availableUsers, isReviewer, onClose, onChanged }: Props) {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [removingMember, setRemovingMember] = useState<TeamMemberRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Bulk add state
  const [bulkSelected, setBulkSelected] = useState<Map<string, TeamRole>>(new Map());

  const loadMembers = async () => {
    setLoading(true);
    const [{ data: memberRows }, { data: allProfiles }, { data: roles }] = await Promise.all([
      supabase.from('team_members').select('*').eq('team_id', teamId),
      supabase.from('profiles').select('user_id, name, email, is_protected, status'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    const profileMap = new Map<string, any>();
    allProfiles?.forEach(p => profileMap.set(p.user_id, p));
    const roleMap = new Map<string, string>();
    roles?.forEach(r => roleMap.set(r.user_id, r.role));

    const mapped: TeamMemberRow[] = (memberRows || []).map(m => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        name: profile?.name || '',
        email: profile?.email || '',
        teamRole: m.role as TeamRole,
        appRole: roleMap.get(m.user_id) || 'agent',
        status: profile?.status || 'active',
        isProtected: profile?.is_protected || false,
      };
    });

    setMembers(mapped);
    setLoading(false);
  };

  useState(() => { loadMembers(); });

  const leaders = members.filter(m => m.teamRole === 'leader');
  const isLastLeader = (m: TeamMemberRow) => m.teamRole === 'leader' && leaders.length <= 1;

  const handleRoleChange = async (member: TeamMemberRow, newRole: TeamRole) => {
    if (isReviewer) return;
    // Block removing last leader
    if (member.teamRole === 'leader' && newRole !== 'leader' && leaders.length <= 1) {
      toast({ title: 'Cannot change role', description: 'Team must have at least one Leader', variant: 'destructive' });
      return;
    }

    await supabase.from('team_members').update({ role: newRole as any }).eq('id', member.id);
    await logAdminAction('team_member_role_changed', {
      teamId, userId: member.userId, from: member.teamRole, to: newRole,
    });
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, teamRole: newRole } : m));
    onChanged();
    toast({ title: 'Role updated' });
  };

  const handleRemoveMember = async () => {
    if (!removingMember || isReviewer) return;
    setRemoving(true);

    if (isLastLeader(removingMember)) {
      toast({ title: 'Cannot remove', description: 'Cannot remove the last Leader', variant: 'destructive' });
      setRemoving(false);
      setRemovingMember(null);
      return;
    }

    await supabase.from('team_members').delete().eq('id', removingMember.id);
    await logAdminAction('team_member_removed', {
      teamId, userId: removingMember.userId, name: removingMember.name,
    });

    setMembers(prev => prev.filter(m => m.id !== removingMember.id));
    setRemovingMember(null);
    setRemoving(false);
    onChanged();
    toast({ title: 'Member removed' });
  };

  const handleSaveName = async () => {
    if (!name.trim() || name === initialName || isReviewer) return;
    setSavingName(true);
    await supabase.from('teams').update({ name: name.trim() }).eq('id', teamId);
    await logAdminAction('team_renamed', { teamId, from: initialName, to: name.trim() });
    setSavingName(false);
    setEditingName(false);
    onChanged();
    toast({ title: 'Team renamed' });
  };

  // Add members
  const memberUserIds = new Set(members.map(m => m.userId));
  const addableUsers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return availableUsers.filter(u =>
      !memberUserIds.has(u.userId) &&
      (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [availableUsers, memberUserIds, memberSearch]);

  const toggleBulkSelect = (userId: string) => {
    setBulkSelected(prev => {
      const next = new Map(prev);
      if (next.has(userId)) next.delete(userId);
      else next.set(userId, 'agent');
      return next;
    });
  };

  const setBulkRole = (userId: string, role: TeamRole) => {
    setBulkSelected(prev => {
      const next = new Map(prev);
      next.set(userId, role);
      return next;
    });
  };

  const handleBulkAdd = async () => {
    if (bulkSelected.size === 0 || isReviewer) return;
    const inserts = Array.from(bulkSelected.entries()).map(([userId, role]) => ({
      team_id: teamId,
      user_id: userId,
      role: role as any,
    }));

    await supabase.from('team_members').insert(inserts);
    await logAdminAction('team_member_added', {
      teamId,
      members: inserts.map(i => ({ userId: i.user_id, role: i.role })),
    });

    setBulkSelected(new Map());
    setShowAddMembers(false);
    setMemberSearch('');
    await loadMembers();
    onChanged();
    toast({ title: `${inserts.length} member(s) added` });
  };

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">Team Detail</SheetTitle>
          </SheetHeader>

          {/* Team Info */}
          <div className="space-y-4 mb-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Team Name</Label>
              {editingName ? (
                <div className="flex gap-2">
                  <Input value={name} onChange={e => setName(e.target.value)} className="h-8" autoFocus />
                  <Button size="sm" className="h-8" onClick={handleSaveName} disabled={savingName || !name.trim() || isReviewer}>
                    {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setName(initialName); setEditingName(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{name}</p>
                  {!isReviewer && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingName(true)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-6">
              <div>
                <p className="text-[10px] text-muted-foreground">Organization</p>
                <p className="text-sm">{orgName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Members</p>
                <p className="text-sm">{members.length}</p>
              </div>
            </div>

            {isReviewer && (
              <Badge variant="secondary" className="text-[10px]">Reviewer Mode — actions disabled</Badge>
            )}
          </div>

          {/* Members Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Members</Label>
              {!isReviewer && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddMembers(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Members
                </Button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
            ) : members.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground">No members assigned</p>
                {!isReviewer && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowAddMembers(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Members
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Team Role</TableHead>
                      <TableHead>App Role</TableHead>
                      <TableHead>Status</TableHead>
                      {!isReviewer && <TableHead className="w-[40px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {m.teamRole === 'leader' && <Crown className="h-3 w-3 text-warning shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.name || m.email}</p>
                              {m.name && <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isReviewer ? (
                            <Badge variant="secondary" className="text-[10px] capitalize">{TEAM_ROLE_LABELS[m.teamRole]}</Badge>
                          ) : (
                            <Select
                              value={m.teamRole}
                              onValueChange={(v) => handleRoleChange(m, v as TeamRole)}
                              disabled={isLastLeader(m)}
                            >
                              <SelectTrigger className="h-7 w-[90px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="leader">Leader</SelectItem>
                                <SelectItem value="agent">Agent</SelectItem>
                                <SelectItem value="isa">ISA</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] capitalize">{m.appRole}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.status === 'active' ? 'opportunity' : 'warning'} className="text-[10px] capitalize">
                            {m.status}
                          </Badge>
                        </TableCell>
                        {!isReviewer && (
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemovingMember(m)}
                              disabled={isLastLeader(m)}
                              title={isLastLeader(m) ? 'Cannot remove last leader' : 'Remove member'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Members Dialog */}
      {showAddMembers && (
        <Dialog open onOpenChange={() => { setShowAddMembers(false); setBulkSelected(new Map()); setMemberSearch(''); }}>
          <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Members to {name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  className="pl-9 h-9"
                  autoFocus
                />
              </div>

              {/* Selected for bulk add */}
              {bulkSelected.size > 0 && (
                <div className="space-y-1.5 p-2 rounded-lg border border-primary/20 bg-primary/5">
                  <p className="text-[10px] font-semibold text-primary">{bulkSelected.size} selected</p>
                  {Array.from(bulkSelected.entries()).map(([uid, role]) => {
                    const u = availableUsers.find(au => au.userId === uid);
                    return u ? (
                      <div key={uid} className="flex items-center justify-between text-sm">
                        <span className="truncate">{u.name || u.email}</span>
                        <div className="flex items-center gap-1">
                          <Select value={role} onValueChange={(v) => setBulkRole(uid, v as TeamRole)}>
                            <SelectTrigger className="h-6 w-[80px] text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="leader">Leader</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                              <SelectItem value="isa">ISA</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => toggleBulkSelect(uid)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {/* Available users */}
              <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                {addableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {memberSearch ? 'No matching users' : 'All users are already members'}
                  </p>
                ) : (
                  addableUsers.slice(0, 20).map(u => (
                    <button
                      key={u.userId}
                      className={`w-full flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors text-left ${bulkSelected.has(u.userId) ? 'bg-primary/10' : ''}`}
                      onClick={() => toggleBulkSelect(u.userId)}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${bulkSelected.has(u.userId) ? 'bg-primary border-primary' : 'border-border'}`}>
                        {bulkSelected.has(u.userId) && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm truncate">{u.name || u.email}</p>
                        {u.name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddMembers(false); setBulkSelected(new Map()); }}>Cancel</Button>
              <Button onClick={handleBulkAdd} disabled={bulkSelected.size === 0}>
                Add {bulkSelected.size} Member{bulkSelected.size !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Remove Confirmation */}
      {removingMember && (
        <Dialog open onOpenChange={() => setRemovingMember(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Remove Member
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              Remove <strong>{removingMember.name || removingMember.email}</strong> from this team?
            </p>
            <p className="text-xs text-muted-foreground">They will no longer be part of this team but their account remains active.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemovingMember(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRemoveMember} disabled={removing}>
                {removing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
