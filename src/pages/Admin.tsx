import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, Users, Target, ListChecks, Database, Plus, Trash2, AlertTriangle, Building2, UsersRound, ScrollText, ChevronRight, Crown } from 'lucide-react';
import { BrokerageDashboard } from '@/components/BrokerageDashboard';
import { ImportHealthPanel } from '@/components/ImportHealthPanel';
import { SeedPacksModal } from '@/components/SeedPacksModal';
import { UserManagementPanel } from '@/components/admin/UserManagementPanel';
import { CreateTeamModal } from '@/components/admin/CreateTeamModal';
import { TeamDetailSheet } from '@/components/admin/TeamDetailSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

export default function Admin() {
  const { user, profiles, fetchProfiles, logAdminAction } = useAuth();
  const { leads, deals, tasks, seedDemoData, seedPacks, clearSeededData, wipeData, hasData, hasSeededData } = useData();
  const [showSeedPacks, setShowSeedPacks] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');

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

  const handleSeedDemoData = async () => {
    await seedDemoData();
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

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Admin Console</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage users, teams, data, and system settings</p>

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
          <Button size="sm" variant="outline" onClick={() => setShowCreateTeam(true)} disabled={organizations.length === 0 || isReviewer}>
            <Plus className="h-4 w-4 mr-1" /> Create Team
          </Button>
        </div>
        {teams.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <UsersRound className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No teams yet</p>
            {organizations.length > 0 && !isReviewer && (
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
              const leaderCount = members.filter(m => m.role === 'leader').length;
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
                      {/* Member avatars preview */}
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
          isReviewer={isReviewer}
          onClose={() => setSelectedTeamId(null)}
          onChanged={() => {
            loadOrgData();
            loadAuditLog();
          }}
        />
      )}
    </div>
  );
}
