import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, Users, Target, ListChecks, Database, Plus, Trash2, AlertTriangle, Building2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { UserRole, Organization, Team, TeamMember } from '@/types';
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

export default function Admin() {
  const { user, profiles, fetchProfiles, updateUserRole } = useAuth();
  const { leads, deals, tasks, seedDemoData, wipeData } = useData();
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  // Org/Team state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchProfiles();
      loadOrgData();
    }
  }, [user?.role]);

  const loadOrgData = async () => {
    const [{ data: orgs }, { data: tms }, { data: members }] = await Promise.all([
      supabase.from('organizations').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
    ]);

    if (orgs) setOrganizations(orgs.map(o => ({ id: o.id, name: o.name, ownerUserId: o.owner_user_id || undefined, createdAt: o.created_at })));
    if (tms) setTeams(tms.map(t => ({ id: t.id, organizationId: t.organization_id, name: t.name, teamLeaderUserId: t.team_leader_user_id || undefined, createdAt: t.created_at })));
    if (members) {
      const profileMap = new Map(profiles.map(p => [p.id, p.name]));
      setTeamMembers(members.map(m => ({
        id: m.id, teamId: m.team_id, userId: m.user_id,
        userName: profileMap.get(m.user_id) || 'Unknown',
        role: m.role as any,
        defaultSplitPercent: m.default_split_percent ? Number(m.default_split_percent) : undefined,
      })));
    }
  };

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    await supabase.from('organizations').insert({ name: newOrgName.trim(), owner_user_id: user!.id });
    setNewOrgName('');
    setShowCreateOrg(false);
    await loadOrgData();
  };

  const createTeam = async () => {
    if (!newTeamName.trim() || !selectedOrgId) return;
    await supabase.from('teams').insert({ name: newTeamName.trim(), organization_id: selectedOrgId, team_leader_user_id: user!.id });
    setNewTeamName('');
    setShowCreateTeam(false);
    await loadOrgData();
  };

  const addMemberToTeam = async (teamId: string, userId: string) => {
    await supabase.from('team_members').insert({ team_id: teamId, user_id: userId, role: 'agent' as any });
    await loadOrgData();
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

      {/* Data Tools */}
      <section className="rounded-lg border border-border bg-card p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="h-4 w-4" /> Test Data Tools</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={seedDemoData}><Plus className="h-4 w-4 mr-1" /> Seed Demo Data</Button>
          <Button size="sm" variant="destructive" onClick={() => setShowWipeConfirm(true)}><Trash2 className="h-4 w-4 mr-1" /> Wipe Test Data</Button>
        </div>
        {showWipeConfirm && (
          <div className="mt-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Confirm Data Wipe</p>
                <p className="text-xs text-muted-foreground mt-1">This will delete all leads, deals, tasks, and alerts.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => { wipeData(); setShowWipeConfirm(false); }}>Yes, Wipe Data</Button>
              <Button size="sm" variant="outline" onClick={() => setShowWipeConfirm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

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
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
        {showCreateTeam && (
          <div className="mb-4 p-4 rounded-lg border border-border bg-muted/50 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Organization</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  {organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Team Name</Label>
              <Input size={1} value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Listing Team" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createTeam}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No teams yet</p>
        ) : (
          <div className="space-y-3">
            {teams.map(team => {
              const members = teamMembers.filter(m => m.teamId === team.id);
              const org = organizations.find(o => o.id === team.organizationId);
              const nonMembers = profiles.filter(p => !members.some(m => m.userId === p.id));
              return (
                <div key={team.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">{org?.name}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-sm pl-2">
                        <span>{m.userName}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{TEAM_ROLE_LABELS[m.role]}</Badge>
                      </div>
                    ))}
                    {nonMembers.length > 0 && (
                      <Select onValueChange={(userId) => addMemberToTeam(team.id, userId)}>
                        <SelectTrigger className="h-8 text-xs mt-2">
                          <SelectValue placeholder="+ Add member" />
                        </SelectTrigger>
                        <SelectContent>
                          {nonMembers.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.email})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* User Management */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> User Management</h2>
        <div className="space-y-1">
          {profiles.map(u => (
            <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{u.name || u.email}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{u.role}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.id !== user?.id && (
                <Select value={u.role} onValueChange={(v) => updateUserRole(u.id, v as UserRole)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="beta">Beta</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
