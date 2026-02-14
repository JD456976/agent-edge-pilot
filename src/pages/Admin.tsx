import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { ShieldCheck, Users, Target, ListChecks, Bell, Database, Plus, Trash2, UserPlus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/types';

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
  const { user, users, createUser, deactivateUser } = useAuth();
  const { leads, deals, tasks, lastSeedTime, seedDemoData, wipeData } = useData();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('reviewer');

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground">You need admin privileges to view this page.</p>
      </div>
    );
  }

  const handleCreateUser = () => {
    if (!newName.trim() || !newEmail.trim()) return;
    createUser(newName.trim(), newEmail.trim(), newRole);
    setNewName(''); setNewEmail(''); setShowCreateUser(false);
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Admin Console</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage users, data, and system settings</p>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard icon={Users} label="Users" value={users.length} />
        <MetricCard icon={Target} label="Leads" value={leads.length} />
        <MetricCard icon={Target} label="Deals" value={deals.length} />
        <MetricCard icon={ListChecks} label="Tasks" value={tasks.length} />
      </div>

      {lastSeedTime && (
        <div className="text-xs text-muted-foreground mb-6 flex items-center gap-1">
          <Database className="h-3 w-3" /> Last seeded: {new Date(lastSeedTime).toLocaleString()}
        </div>
      )}

      {/* Data Tools */}
      <section className="rounded-lg border border-border bg-card p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="h-4 w-4" /> Test Data Tools</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={seedDemoData}>
            <Plus className="h-4 w-4 mr-1" /> Seed Demo Data
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setShowWipeConfirm(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Wipe Test Data
          </Button>
        </div>

        {showWipeConfirm && (
          <div className="mt-4 p-4 rounded-lg border border-urgent/30 bg-urgent/5">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-urgent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Confirm Data Wipe</p>
                <p className="text-xs text-muted-foreground mt-1">This will delete all leads, deals, tasks, and alerts. Admin users and configuration will be preserved.</p>
                <div className="mt-2 text-xs space-y-1">
                  <p>• {leads.length} leads will be deleted</p>
                  <p>• {deals.length} deals will be deleted</p>
                  <p>• {tasks.length} tasks will be deleted</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => { wipeData(); setShowWipeConfirm(false); }}>Yes, Wipe Data</Button>
              <Button size="sm" variant="outline" onClick={() => setShowWipeConfirm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

      {/* User Management */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> User Management</h2>
          <Button size="sm" variant="outline" onClick={() => setShowCreateUser(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Create User
          </Button>
        </div>

        {showCreateUser && (
          <div className="mb-4 p-4 rounded-lg border border-border bg-muted/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input size={1} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input size={1} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateUser}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateUser(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{u.name}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{u.role}</Badge>
                  {!u.isActive && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.id !== user?.id && u.isActive && (
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-urgent" onClick={() => deactivateUser(u.id)}>
                  Deactivate
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
