import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Phone, Mail, MessageSquare, ListTodo, User, Briefcase, Zap, Clock, X, ArrowRight, Flame, Snowflake, ThermometerSun, DollarSign, MapPin, Tag, Filter, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal, Lead, Task } from '@/types';
import { Badge } from '@/components/ui/badge';

interface Props {
  onOpenEntity: (entityId: string, entityType: 'deal' | 'lead') => void;
  onCreateTask: () => void;
  onLogTouch: () => void;
}

const RECENT_STORAGE_KEY = 'dp-cmd-recent';
const MAX_RECENT = 5;

type SearchCategory = 'all' | 'leads' | 'deals' | 'tasks';

interface SearchResult {
  id: string;
  type: 'lead' | 'deal' | 'task' | 'action';
  title: string;
  subtitle: string;
  meta?: string;
  temperature?: string;
  riskLevel?: string;
  stage?: string;
  price?: number;
  entityId?: string;
}

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

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const TEMP_CONFIG = {
  hot: { icon: Flame, color: 'text-urgent', bg: 'bg-urgent/10', label: 'Hot' },
  warm: { icon: ThermometerSun, color: 'text-warning', bg: 'bg-warning/10', label: 'Warm' },
  cold: { icon: Snowflake, color: 'text-primary', bg: 'bg-primary/10', label: 'Cold' },
};

const RISK_CONFIG = {
  red: { color: 'text-urgent', bg: 'bg-urgent/10', label: 'High Risk' },
  yellow: { color: 'text-warning', bg: 'bg-warning/10', label: 'Medium Risk' },
  green: { color: 'text-opportunity', bg: 'bg-opportunity/10', label: 'Low Risk' },
};

const STAGE_LABELS: Record<string, string> = {
  offer: 'Offer',
  offer_accepted: 'Accepted',
  pending: 'Pending',
  closed: 'Closed',
};

export function CommandPalette({ onOpenEntity, onCreateTask, onLogTouch }: Props) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const { leads, deals, tasks } = useData();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearchValue('');
      setCategory('all');
      setSelectedIndex(0);
    }
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    const q = searchValue.toLowerCase().trim();
    const items: SearchResult[] = [];

    // Quick actions (always show when no search or matching)
    if (!q || 'create task'.includes(q) || 'new task'.includes(q)) {
      items.push({ id: 'action-create-task', type: 'action', title: 'Create New Task', subtitle: 'Add a task to your queue', entityId: 'create-task' });
    }
    if (!q || 'log touch'.includes(q) || 'log call'.includes(q) || 'log activity'.includes(q)) {
      items.push({ id: 'action-log-touch', type: 'action', title: 'Log Touch', subtitle: 'Record a call, text, or email', entityId: 'log-touch' });
    }

    // Filter leads
    if (category === 'all' || category === 'leads') {
      const filtered = leads.filter(l => {
        if (!q) return true;
        return l.name.toLowerCase().includes(q) ||
          l.source.toLowerCase().includes(q) ||
          (l.notes || '').toLowerCase().includes(q) ||
          (l.statusTags || []).some(t => t.toLowerCase().includes(q));
      });
      for (const lead of filtered.slice(0, q ? 20 : 5)) {
        items.push({
          id: `lead-${lead.id}`,
          type: 'lead',
          title: lead.name,
          subtitle: lead.source || 'Unknown source',
          temperature: lead.leadTemperature || undefined,
          meta: lead.lastTouchedAt ? `Last touch: ${new Date(lead.lastTouchedAt).toLocaleDateString()}` : undefined,
          entityId: lead.id,
        });
      }
    }

    // Filter deals
    if (category === 'all' || category === 'deals') {
      const filtered = deals.filter(d => {
        if (!q) return true;
        return d.title.toLowerCase().includes(q) ||
          d.stage.toLowerCase().includes(q) ||
          (d.riskFlags || []).some(f => f.toLowerCase().includes(q));
      });
      for (const deal of filtered.slice(0, q ? 20 : 5)) {
        items.push({
          id: `deal-${deal.id}`,
          type: 'deal',
          title: deal.title,
          subtitle: STAGE_LABELS[deal.stage] || deal.stage,
          riskLevel: deal.riskLevel,
          stage: deal.stage,
          price: deal.price,
          entityId: deal.id,
        });
      }
    }

    // Filter tasks
    if (category === 'all' || category === 'tasks') {
      const filtered = tasks.filter(t => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q);
      });
      for (const task of filtered.slice(0, q ? 20 : 5)) {
        const overdue = !task.completedAt && new Date(task.dueAt) < new Date();
        items.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          subtitle: task.completedAt ? 'Completed' : overdue ? 'Overdue' : `Due ${new Date(task.dueAt).toLocaleDateString()}`,
          meta: overdue ? 'overdue' : task.completedAt ? 'completed' : 'pending',
          entityId: task.relatedDealId || task.relatedLeadId || undefined,
        });
      }
    }

    return items;
  }, [searchValue, category, leads, deals, tasks]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, searchValue, category]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (searchValue.trim()) addRecentSearch(searchValue.trim());
    setOpen(false);
    setRecentSearches(getRecentSearches());

    if (result.type === 'action') {
      if (result.entityId === 'create-task') onCreateTask();
      else if (result.entityId === 'log-touch') onLogTouch();
    } else if (result.type === 'lead' && result.entityId) {
      onOpenEntity(result.entityId, 'lead');
    } else if (result.type === 'deal' && result.entityId) {
      onOpenEntity(result.entityId, 'deal');
    } else if (result.type === 'task' && result.entityId) {
      // Navigate to related entity
      const task = tasks.find(t => t.id === result.id.replace('task-', ''));
      if (task?.relatedDealId) onOpenEntity(task.relatedDealId, 'deal');
      else if (task?.relatedLeadId) onOpenEntity(task.relatedLeadId, 'lead');
    }
  }, [onOpenEntity, onCreateTask, onLogTouch, searchValue, tasks]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cats: SearchCategory[] = ['all', 'leads', 'deals', 'tasks'];
      const idx = cats.indexOf(category);
      setCategory(cats[(idx + 1) % cats.length]);
    }
  }, [results, selectedIndex, handleSelect, category]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const categories: { key: SearchCategory; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: leads.length + deals.length + tasks.length },
    { key: 'leads', label: 'Leads', count: leads.length },
    { key: 'deals', label: 'Deals', count: deals.length },
    { key: 'tasks', label: 'Tasks', count: tasks.length },
  ];

  const groupedResults = useMemo(() => {
    const groups: { label: string; icon: typeof User; items: (SearchResult & { idx: number })[] }[] = [];
    let idx = 0;

    const actions = results.filter(r => r.type === 'action');
    const leadResults = results.filter(r => r.type === 'lead');
    const dealResults = results.filter(r => r.type === 'deal');
    const taskResults = results.filter(r => r.type === 'task');

    if (actions.length > 0) {
      groups.push({ label: 'Quick Actions', icon: Zap, items: actions.map(r => ({ ...r, idx: idx++ })) });
    }
    if (leadResults.length > 0) {
      groups.push({ label: 'Leads', icon: User, items: leadResults.map(r => ({ ...r, idx: idx++ })) });
    }
    if (dealResults.length > 0) {
      groups.push({ label: 'Deals', icon: Briefcase, items: dealResults.map(r => ({ ...r, idx: idx++ })) });
    }
    if (taskResults.length > 0) {
      groups.push({ label: 'Tasks', icon: ListTodo, items: taskResults.map(r => ({ ...r, idx: idx++ })) });
    }

    return groups;
  }, [results]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Search Panel */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[12%] z-[101] w-full max-w-2xl -translate-x-1/2"
          >
            <div className="rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/20 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                <Search className="h-5 w-5 text-primary shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search leads, deals, tasks..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {searchValue && (
                  <button onClick={() => setSearchValue('')} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  <span>ESC</span>
                </div>
              </div>

              {/* Category Tabs */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-border/30 bg-muted/20">
                {categories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
                      category === cat.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    {cat.label}
                    {cat.count > 0 && (
                      <span className={cn('ml-1.5 text-[10px]', category === cat.key ? 'opacity-80' : 'opacity-50')}>
                        {cat.count}
                      </span>
                    )}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-muted-foreground/60">TAB to switch</span>
              </div>

              {/* Recent Searches */}
              {!searchValue && recentSearches.length > 0 && (
                <div className="px-4 py-2 border-b border-border/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Recent</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((term, i) => (
                      <button
                        key={i}
                        onClick={() => setSearchValue(term)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 transition-colors"
                      >
                        <Clock className="h-3 w-3" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              <div ref={listRef} className="max-h-[400px] overflow-y-auto overscroll-contain">
                {groupedResults.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No results found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Try a different search or filter</p>
                  </div>
                ) : (
                  groupedResults.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-2 px-4 py-2 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                        <group.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{group.label}</span>
                        <span className="text-[10px] text-muted-foreground/50">{group.items.length}</span>
                      </div>
                      {group.items.map(result => (
                        <div
                          key={result.id}
                          data-index={result.idx}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setSelectedIndex(result.idx)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all duration-100 mx-2 rounded-lg mb-0.5',
                            selectedIndex === result.idx
                              ? 'bg-primary/8 ring-1 ring-primary/20'
                              : 'hover:bg-muted/40'
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            'flex items-center justify-center h-8 w-8 rounded-lg shrink-0',
                            result.type === 'lead' ? 'bg-primary/10' :
                            result.type === 'deal' ? 'bg-opportunity/10' :
                            result.type === 'task' ? 'bg-warning/10' :
                            'bg-muted/60'
                          )}>
                            {result.type === 'lead' ? <User className="h-4 w-4 text-primary" /> :
                             result.type === 'deal' ? <Briefcase className="h-4 w-4 text-opportunity" /> :
                             result.type === 'task' ? <ListTodo className="h-4 w-4 text-warning" /> :
                             <Zap className="h-4 w-4 text-muted-foreground" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {highlightMatch(result.title, searchValue)}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground truncate">{result.subtitle}</span>
                              {result.meta && result.type === 'task' && (
                                <span className={cn('text-[10px] font-medium',
                                  result.meta === 'overdue' ? 'text-urgent' :
                                  result.meta === 'completed' ? 'text-opportunity' :
                                  'text-muted-foreground'
                                )}>
                                  {result.meta === 'overdue' ? '⏰ Overdue' : result.meta === 'completed' ? '✓ Done' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right side badges */}
                          <div className="flex items-center gap-2 shrink-0">
                            {result.temperature && TEMP_CONFIG[result.temperature as keyof typeof TEMP_CONFIG] && (
                              <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                                TEMP_CONFIG[result.temperature as keyof typeof TEMP_CONFIG].bg,
                                TEMP_CONFIG[result.temperature as keyof typeof TEMP_CONFIG].color
                              )}>
                                {(() => {
                                  const Ic = TEMP_CONFIG[result.temperature as keyof typeof TEMP_CONFIG].icon;
                                  return <Ic className="h-3 w-3" />;
                                })()}
                                {TEMP_CONFIG[result.temperature as keyof typeof TEMP_CONFIG].label}
                              </div>
                            )}

                            {result.riskLevel && RISK_CONFIG[result.riskLevel as keyof typeof RISK_CONFIG] && (
                              <div className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                                RISK_CONFIG[result.riskLevel as keyof typeof RISK_CONFIG].bg,
                                RISK_CONFIG[result.riskLevel as keyof typeof RISK_CONFIG].color
                              )}>
                                {RISK_CONFIG[result.riskLevel as keyof typeof RISK_CONFIG].label}
                              </div>
                            )}

                            {result.price && result.price > 0 && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {formatCurrency(result.price)}
                              </span>
                            )}

                            {result.stage && (
                              <span className="text-[10px] text-muted-foreground capitalize">
                                {STAGE_LABELS[result.stage] || result.stage}
                              </span>
                            )}

                            <ArrowRight className={cn('h-3.5 w-3.5 transition-opacity',
                              selectedIndex === result.idx ? 'opacity-60' : 'opacity-0'
                            )} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/10">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">↑↓</kbd> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">↵</kbd> Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">TAB</kbd> Filter
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/50">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
