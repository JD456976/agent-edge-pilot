import { useState, useEffect } from 'react';
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
import { Loader2, ShieldCheck, Crown, Trash2 } from 'lucide-react';
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
  teams: { teamId: string; teamName: string; teamRole: string }[];
  // Entitlement info
  isPro: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  trialEndsAt: string | null;
  source: string | null;
  stripeSubscriptionId: string | null;
}

export function UserDetailDrawer({ userId, onClose, onSaved }: Props) {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('agent');
  const [status, setStatus] = useState('active');
  const [allTeams, setAllTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Pro access fields
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

    // Pro grant state
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

      const d: UserDetail = {
        name: profile.name,
        email: profile.email,
        role: (roleData?.role as UserRole) || 'agent',
        status: (profile as any).status || 'active',
        isProtected: profile.is_protected,
        createdAt: profile.created_at,
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
    if (!detail || isReviewer) return;
    setSaving(true);

    try {
      // Name
      if (name !== detail.name) {
        await supabase.from('profiles').update({ name } as any).eq('user_id', userId);
        await logAdminAction('user_updated', { userId, field: 'name', from: detail.name, to: name });
      }

      // Role
      if (role !== detail.role && !detail.isProtected) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
        await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
        await logAdminAction('role_changed', { userId, from: detail.role, to: role });
      }

      // Status
      if (status !== detail.status && !detail.isProtected) {
        await supabase.from('profiles').update({ status } as any).eq('user_id', userId);
        await logAdminAction(status === 'disabled' ? 'user_disabled' : 'user_updated', { userId, status });
      }

      // Teams
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

      // Pro access grant/revoke
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

  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { targetUserId: userId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({ title: 'User deleted', description: 'Account and all data have been permanently removed.' });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId]
    );
  };

  const isSelf = userId === user?.id;

  // Determine subscription status label
  const getSubscriptionLabel = () => {
    if (!detail) return null;
    if (detail.source === 'stripe' && detail.isPro) return { label: 'Stripe Pro', variant: 'default' as const };
    if (detail.source === 'stripe' && detail.isTrial) return { label: 'Stripe Trial', variant: 'secondary' as const };
    if (detail.source === 'admin_grant' && detail.isPro) return { label: 'Admin Granted', variant: 'outline' as const };
    if (detail.source === 'admin_revoked') return { label: 'Revoked', variant: 'destructive' as const };
    return { label: 'No Subscription', variant: 'secondary' as const };
  };

  const subLabel = getSubscriptionLabel();

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
        </SheetHeader>

        {loading || !detail ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="space-y-5">
            {isReviewer && (
              <Badge variant="secondary" className="text-[10px]">Reviewer Mode — actions disabled</Badge>
            )}

            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={detail.email} disabled className="opacity-60" />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} disabled={isReviewer} />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={detail.isProtected || isReviewer || isSelf}>
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
              <Select value={status} onValueChange={setStatus} disabled={detail.isProtected || isReviewer || isSelf}>
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
                        disabled={isReviewer}
                      />
                      <span className="text-sm">{team.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subscription Status */}
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <Label className="text-xs font-semibold">Subscription</Label>
                </div>
                {subLabel && <Badge variant={subLabel.variant} className="text-[10px]">{subLabel.label}</Badge>}
              </div>

              {/* Show current subscription details */}
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
                <div className="flex items-center justify-between">
                  <span className="text-sm">Grant Pro access</span>
                  <Switch
                    checked={hasProGrant}
                    onCheckedChange={setHasProGrant}
                    disabled={isReviewer}
                  />
                </div>
                {hasProGrant && (
                  <div className="space-y-1.5 mt-2">
                    <Label className="text-xs text-muted-foreground">Expiration date (blank = indefinite)</Label>
                    <Input
                      type="date"
                      value={proExpiresAt}
                      onChange={e => setProExpiresAt(e.target.value)}
                      disabled={isReviewer}
                      min={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Created date */}
            <div>
              <p className="text-[10px] text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(detail.createdAt).toLocaleDateString()}</p>
            </div>

            {/* Save */}
            {!isReviewer && (
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Changes
              </Button>
            )}

            {/* Delete User */}
            {!isReviewer && !detail.isProtected && !isSelf && (
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
