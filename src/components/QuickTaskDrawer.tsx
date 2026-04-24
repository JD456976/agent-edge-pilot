import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Plus, Calendar } from 'lucide-react';
import type { TaskType } from '@/types';

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'call',       label: '📞 Call' },
  { value: 'text',       label: '💬 Text' },
  { value: 'email',      label: '✉️ Email' },
  { value: 'follow_up',  label: '🔁 Follow Up' },
  { value: 'showing',    label: '🏠 Showing' },
  { value: 'closing',    label: '🔑 Closing' },
  { value: 'thank_you',  label: '🙏 Thank You' },
  { value: 'open_house', label: '🪟 Open House' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  dealId?: string;
  dealTitle?: string;
  leadId?: string;
  leadName?: string;
}

export function QuickTaskDrawer({ open, onClose, dealId, dealTitle, leadId, leadName }: Props) {
  const { addTask } = useData();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('call');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const contextLabel = dealTitle || leadName || '';

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: 'Add a task title', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addTask({
        title: title.trim(),
        type,
        dueAt: new Date(dueDate + 'T09:00:00').toISOString(),
        relatedDealId: dealId,
        relatedLeadId: leadId,
        assignedToUserId: user?.id ?? '',
        completedAt: undefined,
        importedFrom: null,
        importRunId: null,
        importedAt: null,
      });
      toast({ title: 'Task added', description: `"${title.trim()}" due ${new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` });
      setTitle('');
      setType('call');
      setDueDate(new Date().toISOString().slice(0, 10));
      onClose();
    } catch (e: any) {
      toast({ title: 'Failed to add task', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Quick Task
            {contextLabel && <span className="text-sm font-normal text-muted-foreground">· {contextLabel}</span>}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          {/* Title */}
          <Input
            placeholder="What needs to happen?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
            className="text-base"
          />

          {/* Type + Due Date row */}
          <div className="flex gap-2">
            <Select value={type} onValueChange={v => setType(v as TaskType)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? 'Adding…' : 'Add Task'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
