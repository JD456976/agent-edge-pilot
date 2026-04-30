import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, ShieldCheck, Crown, Trash2, Copy, Check, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/types';

interface Props {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface UserDetail {
  name: string;
  email: string;
  role: UserRole;
  status: string;
  isProtected: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  teams: { teamId: string; teamName: string; teamRole: string }[];
  isPro: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  trialEndsAt: string | null;
  source: string | null;
  stripeSubscriptionId: string | null;
}

function daysAgoLabel(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
}

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

type AccessStatus = 'active' | 'expiring_soon' | 'expired' | 'revoked';

function getAccessStatus(detail: UserDetail): AccessStatus {
  if (detail.source === 'admin_revoked' || (!detail.isPro && !detail.isTrial && detail.source)) return 'revoked';
  if (detail.expiresAt) {
    const exp = new Date(detail.expiresAt);
    if (exp < new Date()) return 'expired';
    if (exp.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) return 'expiring_soon';
  }
  if (detail.isPro || detail.isTrial) return 'active';
  return 'active';
}

const ACCESS_BADGE: Record<AccessStatus, { label: string; variant: 'opportunity' | 'warning' | 'destructive' | 'secondary' }> = {
  active: { label: 'Active', variant: 'opportunity' },
  expiring_soon: { label: 'Expiring Soon', variant: 'warning' },
  expired: { label: 'Expired', variant: 'destructive' },
  revoked: { label: 'Revoked', variant: 'destructive' },
};

export function UserDetailDrawer({ userId, onClose, onSaved }: Props) {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('agent');
  const [status, setStatus] = useState('active');
  const [allTeams, setAllTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const [hasProGrant, setHasProGrant] = useState(false);
  const [proExpiresAt, setProExpiresAt] = useState('');
  const [originalProGrant, setOriginalProGrant] = useState(false);

  useEffect(() => {
    loadDetail();
  }, [userId]);

  const loadDetail = async () => {
    setLoading(true);
    const [{ data: profile }, { data: roleData }, { data: memberRows }, { data: teams }, { data: entitlement }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId).single(),
      supabase.from('team_members').select('team_id, role').eq('user_id', userId),
      supabase.from('teams').select('id, name'),
      supabase.from('user_entitlements').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const granted = !!entitlement?.is_pro;
    setHasProGrant(granted);
    setOriginalProGrant(granted);
    setProExpiresAt(entitlement?.expires_at ? entitlement.expires_at.slice(0, 10) : '');

    if (teams) setAllTeams(teams.map(t => ({ id: t.id, name: t.name })));

    if (profile) {
      const teamNameMap = new Map<string, string>();
      teams?.forEach(t => teamNameMap.set(t.id, t.name));

      const userTeams = (memberRows || []).map(m => ({
        teamId: m.team_id,
        teamName: teamNameMap.get(m.team_id) || 'Unknown',
        teamRole: m.role,
      }));

      // Try to get last_sign_in_at from auth metadata if available
      let lastSignIn: string | null = null;
      try {
        const { data: authUser } = await supabase.rpc('get_user_last_sign_in' as any, { p_user_id: userId });
        if (authUser) lastSignIn = authUser as unknown as string;
      } catch {
        // Not available, use created_at as fallback
      }

      const d: UserDetail = {
        name: profile.name,
        email: profile.email,
        role: (roleData?.role as UserRole) || 'agent',
        status: (profile as any).status || 'active',
        isProtected: profile.is_protected,
        createdAt: profile.created_at,
        lastSignInAt: lastSignIn,
        teams: userTeams,
        isPro: entitlement?.is_pro ?? false,
        isTrial: entitlement?.is_trial ?? false,
        expiresAt: entitlement?.expires_at ?? null,
        trialEndsAt: entitlement?.trial_ends_at ?? null,
        source: entitlement?.source ?? null,
        stripeSubscriptionId: entitlement?.stripe_subscription_id ?? null,
      };

      setDetail(d);
      setName(d.name);
      setRole(d.role);
      setStatus(d.status);
      setSelectedTeamIds(userTeams.map(t => t.teamId));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);

    try {
      if (name !== detail.name) {
        await supabase.from('profiles').update({ name } as any).eq('user_id', userId);
        await logAdminAction('user_updated', { userId, field: 'name', from: detail.name, to: name });
      }

      if (role !== detail.role && !detail.isProtected) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
        await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
        await logAdminAction('role_changed', { userId, from: detail.role, to: role });
      }

      if (status !== detail.status && !detail.isProtected) {
        await supabase.from('profiles').update({ status } as any).eq('user_id', userId);
        await logAdminAction(status === 'disabled' ? 'user_disabled' : 'user_updated', { userId, status });
      }

      const prevTeams = new Set(detail.teams.map(t => t.teamId));
      const nextTeams = new Set(selectedTeamIds);
      const toAdd = selectedTeamIds.filter(t => !prevTeams.has(t));
      const toRemove = detail.teams.filter(t => !nextTeams.has(t.teamId)).map(t => t.teamId);

      if (toAdd.length > 0) {
        await supabase.from('team_members').insert(
          toAdd.map(tid => ({ team_id: tid, user_id: userId, role: 'agent' as any }))
        );
        await logAdminAction('team_membership_changed', { userId, added: toAdd });
      }
      if (toRemove.length > 0) {
        for (const tid of toRemove) {
          await supabase.from('team_members').delete().eq('team_id', tid).eq('user_id', userId);
        }
        await logAdminAction('team_membership_changed', { userId, removed: toRemove });
      }

      if (hasProGrant !== originalProGrant || (hasProGrant && proExpiresAt)) {
        if (hasProGrant) {
          await supabase.from('user_entitlements').upsert({
            user_id: userId,
            is_pro: true,
            is_trial: false,
            source: 'admin_grant',
            expires_at: proExpiresAt ? new Date(proExpiresAt + 'T23:59:59Z').toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          await logAdminAction('pro_access_granted', { userId, expires_at: proExpiresAt || 'never' });
        } else {
          await supabase.from('user_entitlements')
            .update({ is_pro: false, is_trial: false, source: 'admin_revoked', updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          await logAdminAction('pro_access_revoked', { userId });
        }
      }

      toast({ title: 'User updated' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleRevokeImmediately = async () => {
    setSaving(true);
    try {
      await supabase.from('user_entitlements')
        .update({
          is_pro: false,
          is_trial: false,
          source: 'admin_revoked',
          expires_at: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('user_id', userId);
      await logAdminAction('pro_access_revoked', { userId, immediate: true });
      toast({ description: 'Access revoked immediately.' });
      setHasProGrant(false);
      setOriginalProGrant(false);
      setProExpiresAt('');
      await loadDetail();
    } catch (err: any) {
      toast({ title: 'Revoke failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/admin-delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Delete failed');

      if (result.warning) {
        toast({ title: 'User removed', description: result.warning });
      } else {
        toast({ title: 'User deleted', description: 'Account and all data have been permanently removed.' });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
  };

  const handleCopyInviteLink = async () => {
    const link = `${window.location.origin}/login`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({ description: 'Invite link copied to clipboard.' });
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId]
    );
  };

  const handleGrantToggle = (checked: boolean) => {
    setHasProGrant(checked);
    if (checked && !proExpiresAt) {
      setProExpiresAt(defaultExpiry());
    }
  };

  const isSelf = userId === user?.id;

  const accessStatus = detail ? getAccessStatus(detail) : 'active';
  const badge = ACCESS_BADGE[accessStatus];

  const subLabel = useMemo(() => {
    if (!detail) return null;
    if (detail.source === 'stripe' && detail.isPro) return { label: 'Stripe Pro', variant: 'default' as const };
    if (detail.source === 'stripe' && detail.isTrial) return { label: 'Stripe Trial', variant: 'secondary' as const };
    if (detail.source === 'admin_grant' && detail.isPro) return { label: 'Admin Granted', variant: 'outline' as const };
    if (detail.source === 'admin_revoked') return { label: 'Revoked', variant: 'destructive' as const };
    return { label: 'No Subscription', variant: 'secondary' as const };
  }, [detail]);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base flex items-center gap-2">
            User Detail
            {detail?.isProtected && (
              <Badge variant="outline" className="text-[10px]">
                <ShieldCheck className="h-3 w-3 mr-0.5" /> Protected
              </Badge>
            )}
          </SheetTitle>
          {detail && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
              <span className="text-[11px] text-muted-foreground">
                Last login: {daysAgoLabel(detail.lastSignInAt || detail.createdAt)}
              </span>
            </div>
          )}
        </SheetHeader>

        {loading || !detail ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="space-y-5">

            {/* Email (read-only) + Copy invite link */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="flex gap-2">
                <Input value={detail.email} disabled className="opacity-60 flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-2.5 shrink-0"
                  onClick={handleCopyInviteLink}
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="ml-1 text-xs">{copiedLink ? 'Copied' : 'Invite Link'}</span>
                </Button>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={detail.isProtected || isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                </SelectContent>
              </Select>
              {detail.isProtected && <p className="text-[10px] text-muted-foreground">Protected users cannot have their role changed</p>}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={detail.isProtected || isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Team membership */}
            {allTeams.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Team Membership</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {allTeams.map(team => (
                    <div key={team.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedTeamIds.includes(team.id)}
                        onCheckedChange={() => toggleTeam(team.id)}
                      />
                      <span className="text-sm">{team.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subscription & Access Control */}
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <Label className="text-xs font-semibold">Subscription</Label>
                </div>
                {subLabel && <Badge variant={subLabel.variant} className="text-[10px]">{subLabel.label}</Badge>}
              </div>

              {detail.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  {detail.isPro ? 'Pro' : detail.isTrial ? 'Trial' : 'Access'} expires: {new Date(detail.expiresAt).toLocaleDateString()}
                </p>
              )}
              {detail.trialEndsAt && detail.isTrial && (
                <p className="text-xs text-muted-foreground">
                  Trial ends: {new Date(detail.trialEndsAt).toLocaleDateString()}
                </p>
              )}
              {detail.stripeSubscriptionId && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Stripe: {detail.stripeSubscriptionId.slice(0, 20)}…
                </p>
              )}

              <div className="border-t border-primary/10 pt-2 mt-2">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">Admin Override</p>

                {/* Expiry date picker — prominent, above toggle */}
                <div className="space-y-1.5 mb-3">
                  <Label className="text-xs font-medium">Access expires:</Label>
                  <Input
                    type="date"
                    value={proExpiresAt}
                    onChange={e => setProExpiresAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    placeholder="No expiry"
                  />
                  {!proExpiresAt && hasProGrant && (
                    <p className="text-[10px] text-muted-foreground">No expiry — access is indefinite</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Grant Pro access</span>
                  <Switch
                    checked={hasProGrant}
                    onCheckedChange={handleGrantToggle}
                  />
                </div>

                {/* Revoke Immediately */}
                {(detail.isPro || detail.isTrial) && !isSelf && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full mt-3"
                    onClick={handleRevokeImmediately}
                    disabled={saving}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    Revoke Immediately
                  </Button>
                )}
              </div>
            </div>

            {/* Created date */}
            <div>
              <p className="text-[10px] text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(detail.createdAt).toLocaleDateString()}</p>
            </div>

            {/* Save */}
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>

            {/* Delete User */}
            {!detail.isProtected && !isSelf && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete User
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Permanently delete this user?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove <strong>{detail.name}</strong> ({detail.email}) and all their data including leads, deals, tasks, activity history, and settings. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteUser}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleting}
                    >
                      {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Delete Permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
