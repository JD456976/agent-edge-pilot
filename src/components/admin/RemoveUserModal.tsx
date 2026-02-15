import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
  onClose: () => void;
  onRemoved: () => void;
}

export function RemoveUserModal({ managedUser, onClose, onRemoved }: Props) {
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [removing, setRemoving] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const checkBlocked = async (): Promise<string | null> => {
    if (managedUser.isProtected) return 'This account is protected and cannot be removed.';

    // Check if last admin
    if (managedUser.role === 'admin') {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin' as any);
      
      // Filter out deleted users
      const { data: activeProfiles } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('is_deleted', false);
      
      const activeAdminIds = new Set((activeProfiles || []).map((p: any) => p.user_id));
      const activeAdmins = (adminRoles || []).filter((r: any) => activeAdminIds.has(r.user_id));
      
      if (activeAdmins.length <= 1) {
        return 'Cannot remove the last admin in the organization.';
      }
    }

    return null;
  };

  const handleRemove = async () => {
    setRemoving(true);

    const reason = await checkBlocked();
    if (reason) {
      setBlockReason(reason);
      setRemoving(false);
      return;
    }

    try {
      // Soft delete: mark profile as deleted
      await supabase.from('profiles').update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user!.id,
        status: 'removed',
      } as any).eq('user_id', managedUser.userId);

      // Remove from all teams
      for (const team of managedUser.teams) {
        await supabase.from('team_members').delete()
          .eq('team_id', team.teamId)
          .eq('user_id', managedUser.userId);
      }

      await logAdminAction('user_removed', {
        userId: managedUser.userId,
        email: managedUser.email,
        name: managedUser.name,
      });

      toast({ title: 'User removed', description: `${managedUser.name || managedUser.email} has been removed.` });
      onRemoved();
    } catch (err: any) {
      toast({ title: 'Removal failed', description: err.message, variant: 'destructive' });
    }
    setRemoving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Remove User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            You are about to remove <strong>{managedUser.name || managedUser.email}</strong>. This will:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Prevent the user from accessing the app</li>
            <li>Remove them from all teams</li>
            <li>Keep historical records (deals, tasks) intact</li>
          </ul>

          {blockReason && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm text-destructive">{blockReason}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Type <strong>REMOVE</strong> to confirm
            </p>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type REMOVE"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={confirmText !== 'REMOVE' || removing}
          >
            {removing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Remove User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
