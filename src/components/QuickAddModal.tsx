import { useState } from 'react';
import { Plus, X, Calendar, DollarSign, User2, Target, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TaskType } from '@/types';

type QuickAddType = 'lead' | 'deal' | 'task';

interface QuickAddModalProps {
  defaultType?: QuickAddType;
  onClose: () => void;
}

export function QuickAddModal({ defaultType = 'lead', onClose }: QuickAddModalProps) {
  const { user } = useAuth();
  const { addTask, refreshData } = useData();
  const [type, setType] = useState<QuickAddType>(defaultType);
  const [saving, setSaving] = useState(false);

  // Lead fields
  const [leadName, setLeadName] = useState('');
  const [leadSource, setLeadSource] = useState('Manual');

  // Deal fields
  const [dealTitle, setDealTitle] = useState('');
  const [dealPrice, setDealPrice] = useState('');
  const [dealCommission, setDealCommission] = useState('');

  // Task fields
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('follow_up');
  const [taskDueDate, setTaskDueDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      if (type === 'lead') {
        if (!leadName.trim()) return;
        await supabase.from('leads').insert({
          name: leadName.trim(),
          source: leadSource,
          assigned_to_user_id: user.id,
          last_contact_at: new Date().toISOString(),
          engagement_score: 50,
        });
      } else if (type === 'deal') {
        if (!dealTitle.trim()) return;
        const price = parseFloat(dealPrice) || 0;
        const commission = parseFloat(dealCommission) || 0;
        const { data: deal } = await supabase.from('deals').insert({
          title: dealTitle.trim(),
          price,
          commission_amount: commission,
          assigned_to_user_id: user.id,
          close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }).select().single();

        // Add current user as primary agent
        if (deal) {
          await supabase.from('deal_participants').insert({
            deal_id: deal.id,
            user_id: user.id,
            role: 'primary_agent' as any,
            split_percent: 100,
          });
        }
      } else if (type === 'task') {
        if (!taskTitle.trim()) return;
        await addTask({
          title: taskTitle.trim(),
          type: taskType,
          dueAt: new Date(taskDueDate + 'T12:00:00').toISOString(),
          assignedToUserId: user.id,
        });
      }

      await refreshData();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: QuickAddType; label: string; icon: React.ElementType }[] = [
    { key: 'lead', label: 'Lead', icon: User2 },
    { key: 'deal', label: 'Deal', icon: Target },
    { key: 'task', label: 'Task', icon: ListChecks },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Quick Add</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* Type Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                type === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Lead Form */}
        {type === 'lead' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Contact name" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select value={leadSource} onValueChange={setLeadSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Zillow">Zillow</SelectItem>
                  <SelectItem value="Realtor.com">Realtor.com</SelectItem>
                  <SelectItem value="Referral">Referral</SelectItem>
                  <SelectItem value="Open House">Open House</SelectItem>
                  <SelectItem value="Website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Deal Form */}
        {type === 'deal' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={dealTitle} onChange={e => setDealTitle(e.target.value)} placeholder="e.g. 123 Main St" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Price ($)</Label>
                <Input type="number" value={dealPrice} onChange={e => setDealPrice(e.target.value)} placeholder="350000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Commission ($)</Label>
                <Input type="number" value={dealCommission} onChange={e => setDealCommission(e.target.value)} placeholder="10500" />
              </div>
            </div>
          </div>
        )}

        {/* Task Form */}
        {type === 'task' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={taskType} onValueChange={v => setTaskType(v as TaskType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="showing">Showing</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="closing">Closing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <Button className="w-full mt-4" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : `Add ${tabs.find(t => t.key === type)?.label}`}
        </Button>
      </div>
    </div>
  );
}
