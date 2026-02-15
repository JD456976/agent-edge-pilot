import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Phone, Mail, MessageSquare, ListTodo, User, Briefcase, Zap, StickyNote, Clock } from 'lucide-react';
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

const RECENT_STORAGE_KEY = 'dp-cmd-recent';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function addRecentSearch(term: string) {
  if (!term.trim()) return;
  const recent = getRecentSearches().filter(s => s !== term);
  recent.unshift(term);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function CommandPalette({ onOpenEntity, onCreateTask, onLogTouch }: Props) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
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
    if (searchValue.trim()) addRecentSearch(searchValue.trim());
    setOpen(false);
    setSearchValue('');
    setRecentSearches(getRecentSearches());
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
    <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearchValue(''); }}>
      <CommandInput placeholder="Search deals, leads, or type a command..." value={searchValue} onValueChange={setSearchValue} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentSearches.length > 0 && !searchValue && (
          <CommandGroup heading="Recent Searches">
            {recentSearches.map((term, i) => (
              <CommandItem key={`recent-${i}`} onSelect={() => setSearchValue(term)}>
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{term}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

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
