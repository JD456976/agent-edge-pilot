import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, Users, Target, ListChecks, Database, Plus, Trash2, AlertTriangle, Building2, UsersRound, ScrollText, ChevronRight, Crown, BarChart3, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { BrokerageDashboard } from '@/components/BrokerageDashboard';
import { ImportHealthPanel } from '@/components/ImportHealthPanel';

import { UserManagementPanel } from '@/components/admin/UserManagementPanel';
import { CreateTeamModal } from '@/components/admin/CreateTeamModal';
import { TeamDetailSheet } from '@/components/admin/TeamDetailSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Organization, Team, TeamMember } from '@/types';
import { TEAM_ROLE_LABELS } from '@/types';

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>
      <div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface AuditEvent {
  id: string;
  action: string;
  admin_user_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface ProfileOption {
  userId: string;
  name: string;
  email: string;
}

// ── Reports Tab ──────────────────────────────────────────────────────────────

interface SubscriptionTier {
  label: string;
  count: number;
}

interface ExpiringUser {
  userId: string;
  name: string;
  email: string;
  expiresAt: string;
}

interface EventTypeCount {
  touchType: string;
  count: number;
}

function AdminReportsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [signupsThisWeek, setSignupsThisWeek] = useState(0);
  const [signupsLastWeek, setSignupsLastWeek] = useState(0);
  const [expiringUsers, setExpiringUsers] = useState<ExpiringUser[]>([]);
  const [topEvents, setTopEvents] = useState<EventTypeCount[]>([]);

  const loadReports = async () => {
    setLoading(true);
    try {
      // 1) Active users
      const { data: activeProfiles } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('status', 'active')
        .eq('is_deleted', false);
      setActiveUserCount(activeProfiles?.length ?? 0);

      // 2) Subscription tiers from user_entitlements
      const { data: entitlements } = await supabase
        .from('user_entitlements' as any)
        .select('*');
      const tierMap: Record<string, number> = { Pro: 0, Trial: 0, 'Admin Granted': 0, Expired: 0, Free: 0 };
      (entitlements || []).forEach((e: any) => {
        const isExpired = e.expires_at && new Date(e.expires_at) < new Date();
        if (isExpired) {
          tierMap['Expired']++;
        } else if (e.source === 'admin_grant') {
          tierMap['Admin Granted']++;
        } else if (e.is_trial) {
          tierMap['Trial']++;
        } else if (e.is_pro) {
          tierMap['Pro']++;
        } else {
          tierMap['Free']++;
        }
      });
      setTiers(Object.entries(tierMap).filter(([, c]) => c > 0).map(([label, count]) => ({ label, count })));

      // 3) Signups this week vs last week
      const now = new Date();
      const startOfThisWeek = new Date(now);
      startOfThisWeek.setDate(now.getDate() - now.getDay());
      startOfThisWeek.setHours(0, 0, 0, 0);
      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

      const { data: thisWeekSignups } = await supabase
        .from('profiles')
        .select('user_id')
        .gte('created_at', startOfThisWeek.toISOString());
      const { data: lastWeekSignups } = await supabase
        .from('profiles')
        .select('user_id')
        .gte('created_at', startOfLastWeek.toISOString())
        .lt('created_at', startOfThisWeek.toISOString());
      setSignupsThisWeek(thisWeekSignups?.length ?? 0);
      setSignupsLastWeek(lastWeekSignups?.length ?? 0);

      // 4) Users with access expiring in the next 7 days
      const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: expiringEntitlements } = await supabase
        .from('user_entitlements' as any)
        .select('user_id, expires_at')
        .gte('expires_at', now.toISOString())
        .lte('expires_at', sevenDaysOut);

      if (expiringEntitlements && expiringEntitlements.length > 0) {
        const userIds = (expiringEntitlements as any[]).map((e: any) => e.user_id);
        const { data: expProfiles } = await supabase
          .from('profiles')
          .select('user_id, name, email')
          .in('user_id', userIds);
        const profileMap = new Map((expProfiles || []).map((p: any) => [p.user_id, p]));
        setExpiringUsers((expiringEntitlements as any[]).map((e: any) => {
          const p = profileMap.get(e.user_id);
          return { userId: e.user_id, name: p?.name || '—', email: p?.email || '', expiresAt: e.expires_at };
        }));
      } else {
        setExpiringUsers([]);
      }

      // 5) Feature usage — top 5 touch_types in last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase
        .from('activity_events')
        .select('touch_type')
        .gte('created_at', thirtyDaysAgo);
      const typeCount = new Map<string, number>();
      (events || []).forEach((ev: any) => {
        typeCount.set(ev.touch_type, (typeCount.get(ev.touch_type) || 0) + 1);
      });
      const sorted = Array.from(typeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([touchType, count]) => ({ touchType, count }));
      setTopEvents(sorted);
    } catch (err) {
      console.error('Failed to load reports', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, []);

  const handleExtend = async (userId: string) => {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('user_entitlements' as any)
      .update({ expires_at: newExpiry } as any)
      .eq('user_id', userId);
    if (error) {
      toast({ title: 'Failed to extend', description: error.message, variant: 'destructive' });
    } else {
      toast({ description: 'Access extended by 30 days.' });
      loadReports();
    }
  };

  const signupDelta = signupsThisWeek - signupsLastWeek;
  const maxEventCount = topEvents.length > 0 ? topEvents[0].count : 1;

  if (loading) {
    return <p className="text-sm text-muted-foreground py-12 text-center">Loading reports…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Active users & signups */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard icon={Users} label="Active Users" value={activeUserCount} />
        <MetricCard icon={TrendingUp} label="Signups This Week" value={signupsThisWeek} />
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><BarChart3 className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="text-lg font-bold">{signupsLastWeek}</p>
            <p className="text-xs text-muted-foreground">Last Week</p>
          </div>
          {signupDelta !== 0 && (
            <Badge variant={signupDelta > 0 ? 'opportunity' : 'warning'} className="text-[10px] ml-auto">
              {signupDelta > 0 ? '+' : ''}{signupDelta}
            </Badge>
          )}
        </div>
      </div>

      {/* Subscription tiers */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Users by Subscription Tier</h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No entitlement data</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map(t => (
                  <TableRow key={t.label}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Expiring access */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Access Expiring Within 7 Days</h2>
        {expiringUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No users with expiring access</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringUsers.map(u => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(u.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleExtend(u.userId)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Extend
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Feature usage */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Feature Usage (Last 30 Days)</h2>
        {topEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No activity data yet</p>
        ) : (
          <div className="space-y-2">
            {topEvents.map(ev => (
              <div key={ev.touchType} className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 truncate capitalize">{ev.touchType.replace(/_/g, ' ')}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${Math.max(4, (ev.count / maxEventCount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{ev.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Admin Console Tabs ───────────────────────────────────────────────────────

const ADMIN_TABS = ['Management', 'Reports'] as const;

export default function Admin() {
  const { user, profiles, fetchProfiles, logAdminAction, isProtected } = useAuth();
  const { leads, deals, tasks, wipeData } = useData();
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [adminTab, setAdminTab] = useState<typeof ADMIN_TABS[number]>('Management');

  // Org/Team state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<ProfileOption[]>([]);

  // Audit log
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchProfiles();
      loadOrgData();
      loadAuditLog();
    }
  }, [user?.role]);

  const loadOrgData = async () => {
    const [{ data: orgs }, { data: tms }, { data: members }, { data: allProfiles }] = await Promise.all([
      supabase.from('organizations').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('profiles').select('user_id, name, email, is_protected, status'),
    ]);

    if (orgs) setOrganizations(orgs.map(o => ({ id: o.id, name: o.name, ownerUserId: o.owner_user_id || undefined, createdAt: o.created_at })));
    if (tms) setTeams(tms.map(t => ({ id: t.id, organizationId: t.organization_id, name: t.name, teamLeaderUserId: t.team_leader_user_id || undefined, createdAt: t.created_at })));

    const profileMap = new Map<string, { name: string; email: string }>();
    const users: ProfileOption[] = [];
    allProfiles?.forEach(p => {
      profileMap.set(p.user_id, { name: p.name || '', email: p.email });
      if ((p as any).status !== 'removed' && !(p as any).is_deleted) {
        users.push({ userId: p.user_id, name: p.name || '', email: p.email });
      }
    });
    setAvailableUsers(users);

    if (members) {
      setTeamMembers(members.map(m => ({
        id: m.id, teamId: m.team_id, userId: m.user_id,
        userName: profileMap.get(m.user_id)?.name || profileMap.get(m.user_id)?.email || 'Unknown',
        role: m.role as any,
        defaultSplitPercent: m.default_split_percent ? Number(m.default_split_percent) : undefined,
      })));
    }
  };

  const loadAuditLog = async () => {
    const { data } = await supabase
      .from('admin_audit_events' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setAuditEvents(data as unknown as AuditEvent[]);
  };

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    await supabase.from('organizations').insert({ name: newOrgName.trim(), owner_user_id: user!.id });
    await logAdminAction('create_organization', { name: newOrgName.trim() });
    setNewOrgName('');
    setShowCreateOrg(false);
    await loadOrgData();
    await loadAuditLog();
  };


  const handleWipeData = async () => {
    await wipeData();
    setShowWipeConfirm(false);
    setWipeConfirmText('');
    await loadAuditLog();
  };

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground">You need admin privileges to view this page.</p>
      </div>
    );
  }

  const formatAction = (action: string) => {
    const map: Record<string, string> = {
      seed_demo_data: 'Seeded demo data',
      seed_packs: 'Seeded scenario packs',
      clear_seeded_data: 'Cleared seeded data',
      wipe_data: 'Cleared all data',
      create_organization: 'Created organization',
      team_created: 'Created team',
      team_renamed: 'Renamed team',
      team_members_added: 'Added team members',
      team_member_added: 'Added team member',
      team_member_removed: 'Removed team member',
      team_member_role_changed: 'Changed team member role',
      add_team_member: 'Added team member',
      role_change: 'Changed user role',
      role_changed: 'Changed user role',
      user_invited: 'Invited user',
      user_updated: 'Updated user',
      user_disabled: 'Disabled user',
      user_removed: 'Removed user',
      team_membership_changed: 'Changed team membership',
      pro_access_granted: 'Granted Pro access',
      pro_access_revoked: 'Revoked Pro access',
    };
    return map[action] || action;
  };

  const selectedTeam = selectedTeamId ? teams.find(t => t.id === selectedTeamId) : null;
  const selectedTeamOrg = selectedTeam ? organizations.find(o => o.id === selectedTeam.organizationId) : null;

  const isAdminProtected = user?.role === 'admin' && isProtected;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Admin Console</h1>
      <p className="text-sm text-muted-foreground mb-4">Manage users, teams, data, and system settings</p>

      {/* Admin sub-tabs */}
      {isAdminProtected && (
        <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 max-w-xs">
          {ADMIN_TABS.map(t => (
            <button
              key={t}
              onClick={() => setAdminTab(t)}
              className={cn(
                'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors',
                adminTab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Reports tab */}
      {adminTab === 'Reports' && isAdminProtected ? (
        <AdminReportsTab />
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard icon={Users} label="Users" value={profiles.length} />
            <MetricCard icon={Target} label="Leads" value={leads.length} />
            <MetricCard icon={Target} label="Deals" value={deals.length} />
            <MetricCard icon={ListChecks} label="Tasks" value={tasks.length} />
          </div>

          {/* User Management Panel */}
          <UserManagementPanel />

          {/* Data Tools */}
          <section className="rounded-lg border border-border bg-card p-4 mb-6">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="h-4 w-4" /> Data Tools</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setShowSeedPacks(true)}><Plus className="h-4 w-4 mr-1" /> Seed Packs</Button>
              <Button size="sm" variant="outline" onClick={handleSeedDemoData}><Plus className="h-4 w-4 mr-1" /> Quick Seed</Button>
              <Button size="sm" variant="destructive" onClick={() => setShowWipeConfirm(true)}><Trash2 className="h-4 w-4 mr-1" /> Clear All Data</Button>
            </div>
            {showWipeConfirm && (
              <div className="mt-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Confirm Data Wipe</p>
                    <p className="text-xs text-muted-foreground mt-1">This will delete all leads, deals, tasks, and alerts. Type <strong>DELETE</strong> to confirm.</p>
                  </div>
                </div>
                <Input
                  size={1}
                  value={wipeConfirmText}
                  onChange={e => setWipeConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="mb-3 max-w-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={wipeConfirmText !== 'DELETE'} onClick={handleWipeData}>Yes, Wipe Data</Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowWipeConfirm(false); setWipeConfirmText(''); }}>Cancel</Button>
                </div>
              </div>
            )}
          </section>

          {/* Seed Packs Modal */}
          <SeedPacksModal
            open={showSeedPacks}
            onClose={() => setShowSeedPacks(false)}
            onSeed={async (packIds) => { await seedPacks(packIds); await loadAuditLog(); }}
            onClearSeeded={async () => { await clearSeededData(); await loadAuditLog(); }}
            hasRealData={hasData}
            hasSeededData={hasSeededData}
          />

          {/* Organizations */}
          <section className="rounded-lg border border-border bg-card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Organizations</h2>
              <Button size="sm" variant="outline" onClick={() => setShowCreateOrg(true)}><Plus className="h-4 w-4 mr-1" /> Create</Button>
            </div>
            {showCreateOrg && (
              <div className="mb-4 p-4 rounded-lg border border-border bg-muted/50 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Organization Name</Label>
                  <Input size={1} value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="My Brokerage" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createOrg}>Create</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCreateOrg(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No organizations yet</p>
            ) : (
              <div className="space-y-2">
                {organizations.map(org => (
                  <div key={org.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">Created {new Date(org.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Teams */}
          <section className="rounded-lg border border-border bg-card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><UsersRound className="h-4 w-4" /> Teams</h2>
              <Button size="sm" variant="outline" onClick={() => setShowCreateTeam(true)} disabled={organizations.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Create Team
              </Button>
            </div>
            {teams.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <UsersRound className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No teams yet</p>
                {organizations.length > 0 && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowCreateTeam(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Create your first team
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map(team => {
                  const members = teamMembers.filter(m => m.teamId === team.id);
                  const org = organizations.find(o => o.id === team.organizationId);
                  return (
                    <div
                      key={team.id}
                      className="p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/30 cursor-pointer transition-all group"
                      onClick={() => setSelectedTeamId(team.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium">{team.name}</p>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{org?.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            {members.slice(0, 3).map(m => (
                              <div key={m.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                                {m.role === 'leader' && <Crown className="h-3 w-3 text-warning" />}
                                <span className="max-w-[60px] truncate">{m.userName?.split(' ')[0]}</span>
                              </div>
                            ))}
                            {members.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{members.length - 3}</span>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Brokerage Intelligence Dashboard */}
          <section className="rounded-lg border border-border bg-card p-4 mb-6">
            <BrokerageDashboard />
          </section>

          {/* Import Health */}
          <ImportHealthPanel />

          {/* Audit Log */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><ScrollText className="h-4 w-4" /> Audit Log</h2>
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No admin actions recorded yet</p>
            ) : (
              <div className="space-y-1">
                {auditEvents.map(event => {
                  const adminName = profiles.find(p => p.id === event.admin_user_id)?.name || 'Unknown';
                  return (
                    <div key={event.id} className="flex items-center justify-between p-2 rounded-md text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{formatAction(event.action)}</span>
                        <span className="text-muted-foreground ml-2">by {adminName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Create Team Modal */}
          {showCreateTeam && (
            <CreateTeamModal
              organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
              availableUsers={availableUsers}
              defaultOrgId={organizations[0]?.id}
              onClose={() => setShowCreateTeam(false)}
              onCreated={() => {
                setShowCreateTeam(false);
                loadOrgData();
                loadAuditLog();
              }}
            />
          )}

          {/* Team Detail Sheet */}
          {selectedTeam && (
            <TeamDetailSheet
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              orgName={selectedTeamOrg?.name || ''}
              createdAt={selectedTeam.createdAt}
              availableUsers={availableUsers}
              onClose={() => setSelectedTeamId(null)}
              onChanged={() => {
                loadOrgData();
                loadAuditLog();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
