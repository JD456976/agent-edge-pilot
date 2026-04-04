import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, Pencil, UserX, ShieldCheck, Copy, Check, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { InviteUserModal } from './InviteUserModal';
import { EditUserModal } from './EditUserModal';
import { RemoveUserModal } from './RemoveUserModal';
import { UserDetailDrawer } from './UserDetailDrawer';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/types';

interface ManagedUser {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  isProtected: boolean;
  isDeleted: boolean;
  organizationId: string | null;
  teams: { teamId: string; teamName: string }[];
  createdAt: string;
  // entitlement
  isPro: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  source: string | null;
}

type AccessPill = 'active' | 'expiring_soon' | 'expired' | 'revoked' | 'trial' | 'none';

function getAccessPill(u: ManagedUser): AccessPill {
  if (u.isDeleted || u.status === 'removed') return 'revoked';
  if (u.status === 'disabled') return 'revoked';
  if (u.source === 'admin_revoked') return 'revoked';
  if (u.expiresAt) {
    const exp = new Date(u.expiresAt);
    if (exp < new Date()) return 'expired';
    if (exp.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) return 'expiring_soon';
  }
  if (u.isTrial) return 'trial';
  if (u.isPro) return 'active';
  if (u.status === 'active') return 'active';
  return 'none';
}

const PILL_CONFIG: Record<AccessPill, { color: string; label: string }> = {
  active: { color: 'bg-emerald-500', label: 'Active' },
  expiring_soon: { color: 'bg-amber-500', label: 'Expiring' },
  expired: { color: 'bg-destructive', label: 'Expired' },
  revoked: { color: 'bg-destructive', label: 'Revoked' },
  trial: { color: 'bg-muted-foreground/50', label: 'Trial' },
  none: { color: 'bg-muted-foreground/30', label: '—' },
};

function StatusDot({ pill }: { pill: AccessPill }) {
  const cfg = PILL_CONFIG[pill];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.color}`} />
      {cfg.label}
    </span>
  );
}

type SortKey = 'name' | 'status' | 'expiresAt';
type SortDir = 'asc' | 'desc';

export function UserManagementPanel() {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [removingUser, setRemovingUser] = useState<ManagedUser | null>(null);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkGranting, setBulkGranting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: members }, { data: tms }, { data: invites }, { data: entitlements }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
      supabase.from('team_members').select('team_id, user_id'),
      supabase.from('teams').select('id, name'),
      supabase.from('user_invitations' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('user_entitlements').select('user_id, is_pro, is_trial, expires_at, source'),
    ]);

    if (tms) setTeams(tms.map((t: any) => ({ id: t.id, name: t.name })));
    if (invites) setInvitations(invites as any[]);

    const roleMap = new Map<string, UserRole>();
    roles?.forEach((r: any) => roleMap.set(r.user_id, r.role as UserRole));

    const entMap = new Map<string, { isPro: boolean; isTrial: boolean; expiresAt: string | null; source: string | null }>();
    entitlements?.forEach((e: any) => entMap.set(e.user_id, {
      isPro: e.is_pro ?? false,
      isTrial: e.is_trial ?? false,
      expiresAt: e.expires_at ?? null,
      source: e.source ?? null,
    }));

    const teamMap = new Map<string, { teamId: string; teamName: string }[]>();
    const teamNameMap = new Map<string, string>();
    tms?.forEach((t: any) => teamNameMap.set(t.id, t.name));
    members?.forEach((m: any) => {
      const arr = teamMap.get(m.user_id) || [];
      arr.push({ teamId: m.team_id, teamName: teamNameMap.get(m.team_id) || 'Unknown' });
      teamMap.set(m.user_id, arr);
    });

    const mapped: ManagedUser[] = (profiles || []).map((p: any) => {
      const ent = entMap.get(p.user_id);
      return {
        userId: p.user_id,
        name: p.name,
        email: p.email,
        role: roleMap.get(p.user_id) || 'agent',
        status: p.is_deleted ? 'removed' : p.status || 'active',
        isProtected: p.is_protected,
        isDeleted: p.is_deleted,
        organizationId: p.organization_id,
        teams: teamMap.get(p.user_id) || [],
        createdAt: p.created_at,
        isPro: ent?.isPro ?? false,
        isTrial: ent?.isTrial ?? false,
        expiresAt: ent?.expiresAt ?? null,
        source: ent?.source ?? null,
      };
    });

    setUsers(mapped);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      if (u.isDeleted && statusFilter !== 'removed') return false;
      const searchLower = search.toLowerCase();
      if (search && !u.name.toLowerCase().includes(searchLower) && !u.email.toLowerCase().includes(searchLower)) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (teamFilter !== 'all' && !u.teams.some(t => t.teamId === teamFilter)) return false;
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'expiresAt') {
        const aDate = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
        const bDate = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
        cmp = aDate - bDate;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [users, search, roleFilter, statusFilter, teamFilter, sortKey, sortDir]);

  const pendingInvites = invitations.filter((i: any) => i.status === 'pending' || i.status === 'sent');

  const handleCopyLink = async (inviteId: string) => {
    const link = `${window.location.origin}/login?invite=${inviteId}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Invite link copied' });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 inline ml-0.5" />
      : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  // Bulk select
  const allFilteredIds = useMemo(() => filtered.filter(u => !u.isDeleted && u.userId !== user?.id).map(u => u.userId), [filtered, user?.id]);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkGrant = async () => {
    if (selectedIds.size === 0) return;
    setBulkGranting(true);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      for (const uid of selectedIds) {
        await supabase.from('user_entitlements').upsert({
          user_id: uid,
          is_pro: true,
          is_trial: false,
          source: 'admin_grant',
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
      await logAdminAction('bulk_pro_access_granted', { userIds: Array.from(selectedIds), count: selectedIds.size });
      toast({ description: `Granted 30-day access to ${selectedIds.size} user(s).` });
      setSelectedIds(new Set());
      await loadUsers();
    } catch (err: any) {
      toast({ title: 'Bulk grant failed', description: err.message, variant: 'destructive' });
    }
    setBulkGranting(false);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> User Management
        </h2>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <Plus className="h-4 w-4 mr-1" /> Invite User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="removed">Removed</SelectItem>
          </SelectContent>
        </Select>
        {teams.length > 0 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Bulk actions */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs font-medium text-muted-foreground">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkGrant} disabled={bulkGranting}>
            {bulkGranting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Grant 30-day access
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Pending Invitations</p>
          <div className="space-y-1.5">
            {pendingInvites.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{inv.email}</span>
                  <Badge variant="secondary" className="text-[10px] capitalize">{inv.role}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleCopyLink(inv.id)}
                >
                  {copiedId === inv.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span className="ml-1">{copiedId === inv.id ? 'Copied' : 'Copy Link'}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading users...</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  Name <SortIcon col="name" />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                  Status <SortIcon col="status" />
                </TableHead>
                <TableHead>Teams</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('expiresAt')}>
                  Expiry <SortIcon col="expiresAt" />
                </TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(u => {
                  const pill = getAccessPill(u);
                  return (
                    <TableRow
                      key={u.userId}
                      className={`${u.isDeleted ? 'opacity-50' : ''} cursor-pointer hover:bg-accent/50`}
                      onClick={() => setViewingUserId(u.userId)}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(u.userId)}
                          onCheckedChange={() => toggleSelect(u.userId)}
                          disabled={u.isDeleted || u.userId === user?.id}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{u.name || '—'}</span>
                          {u.isProtected && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">Protected</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] capitalize">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusDot pill={pill} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.teams.length > 0 ? u.teams.map(t => t.teamName).join(', ') : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.expiresAt ? new Date(u.expiresAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {!u.isDeleted && u.userId !== user?.id && (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); setEditingUser(u); }}
                              title="Edit user"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!u.isProtected && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setRemovingUser(u); }}
                                title="Remove user"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {showInvite && (
        <InviteUserModal
          teams={teams}
          onClose={() => setShowInvite(false)}
          onInvited={() => { loadUsers(); setShowInvite(false); }}
        />
      )}

      {editingUser && (
        <EditUserModal
          managedUser={editingUser}
          teams={teams}
          onClose={() => setEditingUser(null)}
          onSaved={() => { loadUsers(); setEditingUser(null); }}
        />
      )}

      {removingUser && (
        <RemoveUserModal
          managedUser={removingUser}
          onClose={() => setRemovingUser(null)}
          onRemoved={() => { loadUsers(); setRemovingUser(null); }}
        />
      )}

      {viewingUserId && (
        <UserDetailDrawer
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          onSaved={() => { loadUsers(); setViewingUserId(null); }}
        />
      )}
    </section>
  );
}
