import { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { ImportSourceBadge } from '@/components/ImportSourceBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListChecks, Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskType } from '@/types';

const TABS = ['Today', 'Overdue', 'Future'] as const;
const TASK_TYPES: TaskType[] = ['call', 'text', 'email', 'showing', 'follow_up', 'closing', 'open_house', 'thank_you'];
const typeLabel: Record<TaskType, string> = {
  call: 'Call', text: 'Text', email: 'Email', showing: 'Showing',
  follow_up: 'Follow Up', closing: 'Closing', open_house: 'Open House', thank_you: 'Thank You',
};

export default function Tasks() {
  const { tasks, hasData, seedDemoData, completeTask, uncompleteTask, addTask } = useData();
  const { user } = useAuth();
  const [tab, setTab] = useState<typeof TABS[number]>('Today');
  const [filterType, setFilterType] = useState<TaskType | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<TaskType>('call');

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const filtered = useMemo(() => {
    let list = tasks;
    if (tab === 'Overdue') list = list.filter(t => !t.completedAt && new Date(t.dueAt) < todayStart);
    else if (tab === 'Today') list = list.filter(t => { const d = new Date(t.dueAt); return d >= todayStart && d <= todayEnd; });
    else list = list.filter(t => new Date(t.dueAt) > todayEnd);
    if (filterType !== 'all') list = list.filter(t => t.type === filterType);
    return list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [tasks, tab, filterType]);

  const handleCreate = () => {
    if (!newTitle.trim() || !user) return;
    addTask({
      title: newTitle.trim(),
      type: newType,
      dueAt: new Date().toISOString(),
      assignedToUserId: user.id,
    });
    setNewTitle('');
    setShowCreate(false);
  };

  if (!hasData) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Tasks</h1>
        <p className="text-sm text-muted-foreground mb-6">Your action items</p>
        <EmptyState title="No tasks yet" description="Load demo data to see tasks organized by urgency and type." actionLabel="Load Demo Data" onAction={seedDemoData} icon={<ListChecks className="h-8 w-8 text-muted-foreground" />} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Your action items</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Task</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('flex-1 text-sm font-medium py-1.5 rounded-md transition-colors', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t}
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilterType('all')} className={cn('text-xs px-3 py-1 rounded-full border transition-colors whitespace-nowrap', filterType === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>All</button>
        {TASK_TYPES.map(type => (
          <button key={type} onClick={() => setFilterType(type)} className={cn('text-xs px-3 py-1 rounded-full border transition-colors whitespace-nowrap', filterType === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {typeLabel[type]}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No tasks in this view</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(task => {
            const done = !!task.completedAt;
            const overdue = !done && new Date(task.dueAt) < now;
            return (
              <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                <button
                  onClick={() => done ? uncompleteTask(task.id) : completeTask(task.id)}
                  className={cn('h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors', done ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary')}
                >
                  {done && <Check className="h-3 w-3 text-primary-foreground" />}
                </button>
                <div className={cn('flex-1 min-w-0', done && 'opacity-50')}>
                  <p className={cn('text-sm font-medium truncate', done && 'line-through')}>{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{typeLabel[task.type]}</Badge>
                    {task.importedFrom && <ImportSourceBadge importedFrom={task.importedFrom} compact />}
                    <span className={cn('text-xs', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                      {overdue ? 'Overdue' : new Date(task.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Task</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What needs to be done?" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newType} onValueChange={v => setNewType(v as TaskType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{typeLabel[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleCreate}>Create Task</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
