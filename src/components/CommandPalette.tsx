import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Phone, Mail, MessageSquare, ListTodo, User, Briefcase, Zap, StickyNote } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal, Lead } from '@/types';

interface Props {
  onOpenEntity: (entityId: string, entityType: 'deal' | 'lead') => void;
  onCreateTask: () => void;
  onLogTouch: () => void;
}

export function CommandPalette({ onOpenEntity, onCreateTask, onLogTouch }: Props) {
  const [open, setOpen] = useState(false);
  const { leads, deals, tasks } = useData();
  const { user } = useAuth();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'closed').slice(0, 8), [deals]);
  const activeLeads = useMemo(() => leads.slice(0, 8), [leads]);
  const overdueTasks = useMemo(() => {
    return tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date()).slice(0, 5);
  }, [tasks]);

  const handleSelect = useCallback((action: string) => {
    setOpen(false);
    if (action === 'create-task') {
      onCreateTask();
    } else if (action === 'log-touch') {
      onLogTouch();
    } else if (action.startsWith('deal:')) {
      onOpenEntity(action.replace('deal:', ''), 'deal');
    } else if (action.startsWith('lead:')) {
      onOpenEntity(action.replace('lead:', ''), 'lead');
    }
  }, [onOpenEntity, onCreateTask, onLogTouch]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search deals, leads, or type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => handleSelect('create-task')}>
            <ListTodo className="mr-2 h-4 w-4" />
            <span>Create Task</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('log-touch')}>
            <Phone className="mr-2 h-4 w-4" />
            <span>Log Touch</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {activeDeals.length > 0 && (
          <CommandGroup heading="Deals">
            {activeDeals.map(deal => (
              <CommandItem key={deal.id} onSelect={() => handleSelect(`deal:${deal.id}`)}>
                <Briefcase className="mr-2 h-4 w-4" />
                <span>{deal.title}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{deal.stage.replace('_', ' ')}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {activeLeads.length > 0 && (
          <CommandGroup heading="Leads">
            {activeLeads.map(lead => (
              <CommandItem key={lead.id} onSelect={() => handleSelect(`lead:${lead.id}`)}>
                <User className="mr-2 h-4 w-4" />
                <span>{lead.name}</span>
                {lead.leadTemperature && (
                  <span className={`ml-auto text-xs capitalize ${lead.leadTemperature === 'hot' ? 'text-urgent' : lead.leadTemperature === 'warm' ? 'text-warning' : 'text-muted-foreground'}`}>
                    {lead.leadTemperature}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {overdueTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Overdue Tasks">
              {overdueTasks.map(task => (
                <CommandItem key={task.id} onSelect={() => {
                  setOpen(false);
                  if (task.relatedDealId) onOpenEntity(task.relatedDealId, 'deal');
                  else if (task.relatedLeadId) onOpenEntity(task.relatedLeadId, 'lead');
                }}>
                  <Zap className="mr-2 h-4 w-4 text-urgent" />
                  <span>{task.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
