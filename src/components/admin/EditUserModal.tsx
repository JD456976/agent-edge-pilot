import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
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
}

interface Props {
  managedUser: ManagedUser;
  teams: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditUserModal({ managedUser, teams, onClose, onSaved }: Props) {
  const { logAdminAction } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(managedUser.name);
  const [role, setRole] = useState<string>(managedUser.role);
  const [status, setStatus] = useState(managedUser.status);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(managedUser.teams.map(t => t.teamId));
  const [saving, setSaving] = useState(false);

  const isProtected = managedUser.isProtected;

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev =>
      prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update name
      if (name !== managedUser.name) {
        await supabase.from('profiles').update({ name } as any).eq('user_id', managedUser.userId);
        await logAdminAction('user_updated', { userId: managedUser.userId, field: 'name', from: managedUser.name, to: name });
      }

      // Update role (blocked for protected users)
      if (role !== managedUser.role && !isProtected) {
        await supabase.from('user_roles').delete().eq('user_id', managedUser.userId);
        await supabase.from('user_roles').insert({ user_id: managedUser.userId, role: role as any });
        await logAdminAction('role_changed', { userId: managedUser.userId, from: managedUser.role, to: role });
      }

      // Update status (blocked for protected users)
      if (status !== managedUser.status && !isProtected) {
        await supabase.from('profiles').update({ status } as any).eq('user_id', managedUser.userId);
        if (status === 'disabled') {
          await logAdminAction('user_disabled', { userId: managedUser.userId });
        } else {
          await logAdminAction('user_updated', { userId: managedUser.userId, field: 'status', to: status });
        }
      }

      // Update team membership
      const prevTeams = new Set(managedUser.teams.map(t => t.teamId));
      const nextTeams = new Set(selectedTeams);

      const toAdd = selectedTeams.filter(t => !prevTeams.has(t));
      const toRemove = managedUser.teams.filter(t => !nextTeams.has(t.teamId)).map(t => t.teamId);

      if (toAdd.length > 0) {
        await supabase.from('team_members').insert(
          toAdd.map(tid => ({ team_id: tid, user_id: managedUser.userId, role: 'agent' as any }))
        );
        await logAdminAction('team_membership_changed', { userId: managedUser.userId, added: toAdd });
      }

      if (toRemove.length > 0) {
        for (const tid of toRemove) {
          await supabase.from('team_members').delete().eq('team_id', tid).eq('user_id', managedUser.userId);
        }
        await logAdminAction('team_membership_changed', { userId: managedUser.userId, removed: toRemove });
      }

      toast({ title: 'User updated' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit User
            {isProtected && <Badge variant="outline" className="text-[10px]">Protected</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={managedUser.email} disabled className="opacity-60" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole} disabled={isProtected}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
              </SelectContent>
            </Select>
            {isProtected && <p className="text-[10px] text-muted-foreground">Protected users cannot have their role changed</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={isProtected}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            {isProtected && <p className="text-[10px] text-muted-foreground">Protected users cannot be disabled</p>}
          </div>
          {teams.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Teams</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {teams.map(team => (
                  <div key={team.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedTeams.includes(team.id)}
                      onCheckedChange={() => toggleTeam(team.id)}
                    />
                    <span className="text-sm">{team.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
