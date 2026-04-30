import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Search, Loader2, Eye, Ban, UserCheck, Mail, Calendar,
  Shield, Trash2, UserPlus, X, RefreshCw, Building2,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  status: string;
  is_deleted: boolean;
  is_protected: boolean;
  created_at: string;
}

interface Entitlement {
  user_id: string;
  is_pro: boolean;
  is_trial: boolean;
  expires_at: string | null;
  source: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const GRANT_OPTS = [
  { label: '7d', days: 7 }, { label: '14d', days: 14 }, { label: '30d', days: 30 },
  { label: '60d', days: 60 }, { label: '90d', days: 90 },
];

function accessBadge(ent: Entitlement | undefined) {
  if (!ent) return <Badge variant="outline" className="text-xs">No Access</Badge>;
  if (ent.source === 'admin_revoked')
    return <Badge variant="destructive" className="text-xs">Revoked</Badge>;
  if (ent.expires_at && new Date(ent.expires_at) < new Date())
    return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  if (ent.is_trial)
    return <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">Trial</Badge>;
  if (ent.is_pro)
    return <Badge variant="default" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>;
  return <Badge variant="outline" className="text-xs">No Access</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function UserManagementPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  // Modal state
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [grantTarget, setGrantTarget] = useState<Profile | null>(null);
  const [grantDays, setGrantDays] = useState(30);
  const [grantCustom, setGrantCustom] = useState('');
  const [grantUseCustom, setGrantUseCustom] = useState(false);
  const [extendFromCurrent, setExtendFromCurrent] = useState(false);
  const [granting, setGranting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteDays, setInviteDays] = useState(30);
  const [inviting, setInviting] = useState(false);
  const [suspending, setSuspending] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [profilesRes, entsRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, user_id, name, email, status, is_deleted, is_protected, created_at')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_entitlements' as any)
          .select('user_id, is_pro, is_trial, expires_at, source'),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      setProfiles((profilesRes.data as Profile[]) || []);
      setEntitlements((entsRes.data as Entitlement[]) || []);
      setRoles((rolesRes.data as UserRole[]) || []);
    } catch (err: any) {
      toast({ title: 'Error loading users', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Derived maps ───────────────────────────────────────────────────────────
  const entMap = useMemo(() => {
    const m = new Map<string, Entitlement>();
    entitlements.forEach(e => m.set(e.user_id, e));
    return m;
  }, [entitlements]);

  const roleMap = useMemo(() => {
    const m = new Map<string, string[]>();
    roles.forEach(r => {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r.role);
    });
    return m;
  }, [roles]);

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const t = search.toLowerCase();
    return profiles.filter(p =>
      p.name?.toLowerCase().includes(t) || p.email?.toLowerCase().includes(t)
    );
  }, [profiles, search]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ targetUserId: deleteTarget.user_id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Delete failed');

      // ✅ Immediately remove from local state — don't rely on refetch
      setProfiles(prev => prev.filter(p => p.user_id !== deleteTarget.user_id));
      setDeleteTarget(null);
      setSelectedUser(null);

      if (result.warning) {
        toast({ title: 'User removed', description: result.warning });
      } else {
        toast({ title: 'User deleted', description: `${deleteTarget.email} has been permanently removed.` });
      }
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // ── Suspend / Reactivate ───────────────────────────────────────────────────
  const handleSuspend = async (profile: Profile) => {
    const newStatus = profile.status === 'suspended' ? 'active' : 'suspended';
    setSuspending(profile.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus } as any)
      .eq('user_id', profile.user_id);
    setSuspending(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'suspended' ? 'User suspended' : 'User reactivated' });
      setProfiles(prev => prev.map(p => p.user_id === profile.user_id ? { ...p, status: newStatus } : p));
      setSelectedUser(prev => prev?.user_id === profile.user_id ? { ...prev, status: newStatus } : prev);
    }
  };

  // ── Grant access ───────────────────────────────────────────────────────────
  const effectiveDays = grantUseCustom ? (parseInt(grantCustom) || 0) : grantDays;

  const handleGrantAccess = async () => {
    if (!grantTarget || effectiveDays < 1) return;
    const ent = entMap.get(grantTarget.user_id);
    const base = extendFromCurrent && ent?.expires_at && new Date(ent.expires_at) > new Date()
      ? new Date(ent.expires_at)
      : new Date();
    const expires = new Date(base);
    expires.setDate(expires.getDate() + effectiveDays);

    setGranting(true);
    const existing = entMap.get(grantTarget.user_id);
    const { error } = existing
      ? await supabase.from('user_entitlements' as any)
          .update({ is_pro: true, is_trial: false, source: 'admin_grant', expires_at: expires.toISOString() } as any)
          .eq('user_id', grantTarget.user_id)
      : await supabase.from('user_entitlements' as any)
          .insert({ user_id: grantTarget.user_id, is_pro: true, is_trial: false, source: 'admin_grant', expires_at: expires.toISOString() } as any);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Access granted — ${effectiveDays} days`, description: `Expires ${expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` });
      setGrantTarget(null);
      setSelectedUser(null);
      fetchData(true);
    }
    setGranting(false);
  };

  const handleRevokeAccess = async (profile: Profile) => {
    const { error } = await supabase.from('user_entitlements' as any)
      .update({ is_pro: false, is_trial: false, source: 'admin_revoked' } as any)
      .eq('user_id', profile.user_id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Access revoked' });
      fetchData(true);
      setSelectedUser(null);
    }
  };

  // ── Invite ─────────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ email, name: inviteName.trim() || undefined, days: inviteDays }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invite failed');

      toast({
        title: 'Invite sent',
        description: `${email} will receive a sign-in link. Access granted for ${inviteDays} days.`,
      });
      setShowInvite(false);
      setInviteEmail('');
      setInviteName('');
      fetchData(true);
    } catch (e: any) {
      toast({ title: 'Invite failed', description: e.message, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading users…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users ({profiles.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fetchData(true)} disabled={refreshing} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4" /> Invite User
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9 h-10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {search ? 'No users match your search.' : 'No users yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(profile => {
                    const ent = entMap.get(profile.user_id);
                    const userRoles = roleMap.get(profile.user_id) || [];
                    return (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">{profile.name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{profile.email || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {userRoles.length > 0 ? userRoles.map(r => (
                              <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="text-xs capitalize">{r}</Badge>
                            )) : <span className="text-xs text-muted-foreground">agent</span>}
                          </div>
                        </TableCell>
                        <TableCell>{accessBadge(ent)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={profile.status === 'suspended' ? 'destructive' : 'outline'}
                            className="text-xs capitalize"
                          >
                            {profile.status || 'active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(profile.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedUser(profile)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!profile.is_protected && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteTarget(profile)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── User Detail Dialog ── */}
      <Dialog open={!!selectedUser} onOpenChange={open => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
          {selectedUser && (() => {
            const ent = entMap.get(selectedUser.user_id);
            const userRoles = roleMap.get(selectedUser.user_id) || [];
            const hasAccess = ent?.is_pro || ent?.is_trial;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { icon: Users, label: 'Name', val: selectedUser.name },
                    { icon: Mail, label: 'Email', val: selectedUser.email },
                    { icon: Calendar, label: 'Joined', val: format(new Date(selectedUser.created_at), 'MMM d, yyyy') },
                    { icon: Building2, label: 'Status', val: selectedUser.status || 'active' },
                  ].map(({ icon: Icon, label, val }) => (
                    <div key={label} className="flex items-start gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">{label}</p>
                        <p className="font-medium">{val || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {userRoles.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">Roles:</span>
                    {userRoles.map(r => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">App Access</p>
                      {ent?.expires_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(ent.expires_at) > new Date()
                            ? `Expires ${format(new Date(ent.expires_at), 'MMM d, yyyy')}`
                            : `Expired ${format(new Date(ent.expires_at), 'MMM d, yyyy')}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {accessBadge(ent)}
                </div>

                <div className="flex gap-2 pt-3 border-t flex-wrap">
                  <Button
                    size="sm"
                    variant={selectedUser.status === 'suspended' ? 'default' : 'outline'}
                    disabled={!!suspending}
                    onClick={() => handleSuspend(selectedUser)}
                  >
                    {suspending === selectedUser.user_id
                      ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      : selectedUser.status === 'suspended'
                        ? <><UserCheck className="h-4 w-4 mr-1" />Reactivate</>
                        : <><Ban className="h-4 w-4 mr-1" />Suspend</>
                    }
                  </Button>

                  {hasAccess ? (
                    <Button size="sm" variant="outline" onClick={() => handleRevokeAccess(selectedUser)}>
                      Revoke Access
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => {
                      setGrantTarget(selectedUser);
                      setGrantDays(30);
                      setGrantCustom('');
                      setGrantUseCustom(false);
                      setExtendFromCurrent(false);
                      setSelectedUser(null);
                    }}>
                      <Shield className="h-4 w-4 mr-1" /> Grant Access
                    </Button>
                  )}

                  {!selectedUser.is_protected && (
                    <Button
                      size="sm" variant="outline"
                      className="ml-auto text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setDeleteTarget(selectedUser); setSelectedUser(null); }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete User
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-destructive/30 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold">Delete User Permanently</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This removes{' '}
                  <span className="font-medium text-foreground">{deleteTarget.email || deleteTarget.name}</span>{' '}
                  from all systems. They will lose all access immediately. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1" disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} className="flex-1 gap-1.5" disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grant Access Modal ── */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Grant Access</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]">{grantTarget.email}</p>
              </div>
              <button onClick={() => setGrantTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Access Duration</p>
              <div className="grid grid-cols-5 gap-1.5">
                {GRANT_OPTS.map(o => (
                  <button key={o.days} onClick={() => { setGrantDays(o.days); setGrantUseCustom(false); }}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${!grantUseCustom && grantDays === o.days ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setGrantUseCustom(true)}
                className={`w-full py-2 rounded-lg text-xs font-semibold border transition-colors ${grantUseCustom ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                Custom
              </button>
              {grantUseCustom && (
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" max="365" value={grantCustom}
                    onChange={e => setGrantCustom(e.target.value.replace(/\D/g, ''))}
                    placeholder="Days" className="w-24 text-sm" autoFocus />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
              {effectiveDays > 0 && (() => {
                const base = extendFromCurrent ? new Date(entMap.get(grantTarget.user_id)?.expires_at || Date.now()) : new Date();
                const exp = new Date(base);
                exp.setDate(exp.getDate() + effectiveDays);
                return (
                  <p className="text-xs text-muted-foreground">
                    Expires{' '}
                    <span className="font-medium text-foreground">
                      {exp.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </p>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGrantTarget(null)} className="flex-1" disabled={granting}>Cancel</Button>
              <Button onClick={handleGrantAccess} className="flex-1" disabled={granting || effectiveDays < 1}>
                {granting ? 'Saving…' : 'Grant Access'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite User Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Invite User</h3>
                <p className="text-xs text-muted-foreground mt-0.5">They'll receive a sign-in link via email.</p>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Email Address *</label>
                <Input type="email" placeholder="agent@brokerage.com" value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Name <span className="normal-case text-muted-foreground/60">(optional)</span>
                </label>
                <Input placeholder="First Last" value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()} />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Access Duration</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[7, 14, 30, 60, 90].map(d => (
                    <button key={d} onClick={() => setInviteDays(d)}
                      className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${inviteDays === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Access expires{' '}
                <span className="font-medium text-foreground">
                  {new Date(Date.now() + inviteDays * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInvite(false)} className="flex-1" disabled={inviting}>Cancel</Button>
              <Button onClick={handleInvite} className="flex-1 gap-1.5" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {inviting ? 'Sending…' : 'Send Invite'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
