import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, X, Clock, User, Briefcase, ListTodo, Zap, Flame, Snowflake, ThermometerSun, ArrowLeft, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenEntity: (entityId: string, entityType: 'deal' | 'lead') => void;
  onCreateTask: () => void;
  onLogTouch: () => void;
}

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

const RECENT_KEY = 'dp-cmd-recent';
const MAX_RECENT = 8;

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(term: string) {
  if (!term.trim()) return;
  const r = getRecent().filter(s => s !== term);
  r.unshift(term);
  localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, MAX_RECENT)));
}

function formatPrice(n: number) {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

const TEMP_CONFIG: Record<string, { icon: typeof Flame; color: string; label: string }> = {
  hot: { icon: Flame, color: 'text-urgent', label: 'Hot' },
  warm: { icon: ThermometerSun, color: 'text-warning', label: 'Warm' },
  cold: { icon: Snowflake, color: 'text-primary', label: 'Cold' },
};

const STAGE_LABELS: Record<string, string> = {
  offer: 'Offer', offer_accepted: 'Accepted', pending: 'Pending', closed: 'Closed',
};

export function MobileSearchOverlay({ open, onClose, onOpenEntity, onCreateTask, onLogTouch }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [recent, setRecent] = useState<string[]>(getRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const { leads, deals, tasks } = useData();

  useEffect(() => {
    if (open) {
      setQuery('');
      setCategory('all');
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const items: SearchResult[] = [];

    // Quick actions
    if (category === 'all') {
      if (!q || 'create task new task'.includes(q)) {
        items.push({ id: 'act-task', type: 'action', title: 'Create New Task', subtitle: 'Add to your queue' });
      }
      if (!q || 'log touch call email text'.includes(q)) {
        items.push({ id: 'act-touch', type: 'action', title: 'Log a Touch', subtitle: 'Record a call, text, or email' });
      }
    }

    if (category === 'all' || category === 'leads') {
      const filtered = q
        ? leads.filter(l => l.name.toLowerCase().includes(q) || l.source.toLowerCase().includes(q) || (l.statusTags || []).some(t => t.toLowerCase().includes(q)))
        : leads;
      for (const l of filtered.slice(0, q ? 25 : 6)) {
        items.push({
          id: `lead-${l.id}`, type: 'lead', title: l.name, subtitle: l.source || 'Unknown source',
          temperature: l.leadTemperature || undefined, entityId: l.id,
          meta: l.lastTouchedAt ? new Date(l.lastTouchedAt).toLocaleDateString() : undefined,
        });
      }
    }

    if (category === 'all' || category === 'deals') {
      const filtered = q
        ? deals.filter(d => d.title.toLowerCase().includes(q) || d.stage.toLowerCase().includes(q))
        : deals;
      for (const d of filtered.slice(0, q ? 25 : 6)) {
        items.push({
          id: `deal-${d.id}`, type: 'deal', title: d.title,
          subtitle: STAGE_LABELS[d.stage] || d.stage, riskLevel: d.riskLevel,
          stage: d.stage, price: d.price, entityId: d.id,
        });
      }
    }

    if (category === 'all' || category === 'tasks') {
      const filtered = q
        ? tasks.filter(t => t.title.toLowerCase().includes(q) || t.type.toLowerCase().includes(q))
        : tasks;
      for (const t of filtered.slice(0, q ? 25 : 6)) {
        const overdue = !t.completedAt && new Date(t.dueAt) < new Date();
        items.push({
          id: `task-${t.id}`, type: 'task', title: t.title,
          subtitle: t.completedAt ? 'Completed' : overdue ? 'Overdue' : `Due ${new Date(t.dueAt).toLocaleDateString()}`,
          meta: overdue ? 'overdue' : t.completedAt ? 'completed' : 'pending',
          entityId: t.relatedDealId || t.relatedLeadId || undefined,
        });
      }
    }

    return items;
  }, [query, category, leads, deals, tasks]);

  const handleSelect = useCallback((r: SearchResult) => {
    if (query.trim()) saveRecent(query.trim());
    onClose();
    if (r.type === 'action') {
      if (r.id === 'act-task') onCreateTask();
      else onLogTouch();
    } else if (r.type === 'lead' && r.entityId) {
      onOpenEntity(r.entityId, 'lead');
    } else if (r.type === 'deal' && r.entityId) {
      onOpenEntity(r.entityId, 'deal');
    } else if (r.type === 'task' && r.entityId) {
      const task = tasks.find(t => t.id === r.id.replace('task-', ''));
      if (task?.relatedDealId) onOpenEntity(task.relatedDealId, 'deal');
      else if (task?.relatedLeadId) onOpenEntity(task.relatedLeadId, 'lead');
    }
  }, [onClose, onOpenEntity, onCreateTask, onLogTouch, query, tasks]);

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  };

  const categories: { key: SearchCategory; label: string; icon: typeof User }[] = [
    { key: 'all', label: 'All', icon: Search },
    { key: 'leads', label: 'Leads', icon: User },
    { key: 'deals', label: 'Deals', icon: Briefcase },
    { key: 'tasks', label: 'Tasks', icon: ListTodo },
  ];

  // Group results by type
  const grouped = useMemo(() => {
    const g: { label: string; icon: typeof User; items: SearchResult[] }[] = [];
    const actions = results.filter(r => r.type === 'action');
    const leadR = results.filter(r => r.type === 'lead');
    const dealR = results.filter(r => r.type === 'deal');
    const taskR = results.filter(r => r.type === 'task');
    if (actions.length) g.push({ label: 'Quick Actions', icon: Zap, items: actions });
    if (leadR.length) g.push({ label: 'Leads', icon: User, items: leadR });
    if (dealR.length) g.push({ label: 'Deals', icon: Briefcase, items: dealR });
    if (taskR.length) g.push({ label: 'Tasks', icon: ListTodo, items: taskR });
    return g;
  }, [results]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[110] bg-background flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Search Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
            <button
              onClick={onClose}
              className="flex items-center justify-center h-9 w-9 rounded-xl bg-muted/60 text-muted-foreground active:scale-95 transition-transform"
              aria-label="Close search"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search leads, deals, tasks…"
                className="w-full h-10 pl-9 pr-9 rounded-xl bg-muted/40 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="search"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-95',
                  category === cat.key
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'bg-muted/50 text-muted-foreground border border-border/30'
                )}
              >
                <cat.icon className="h-3 w-3" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
            {/* Recent Searches (when no query) */}
            {!query && recent.length > 0 && (
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Recent Searches</p>
                  <button onClick={clearRecent} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((term, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(term)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground bg-muted/40 border border-border/20 active:scale-95 transition-transform"
                    >
                      <Clock className="h-3 w-3 opacity-50" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No Results */}
            {query && grouped.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                  <Search className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No results for "{query}"</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Try a different search term</p>
              </div>
            )}

            {/* Grouped Results */}
            {grouped.map(group => (
              <div key={group.label} className="mb-1">
                <div className="flex items-center gap-2 px-4 py-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <group.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground/40">{group.items.length}</span>
                </div>
                {group.items.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-muted/60 transition-colors"
                  >
                    {/* Type Icon */}
                    <div className={cn(
                      'flex items-center justify-center h-10 w-10 rounded-xl shrink-0',
                      r.type === 'lead' ? 'bg-primary/10' :
                      r.type === 'deal' ? 'bg-opportunity/10' :
                      r.type === 'task' ? 'bg-warning/10' :
                      'bg-muted/50'
                    )}>
                      {r.type === 'lead' ? <User className="h-4.5 w-4.5 text-primary" /> :
                       r.type === 'deal' ? <Briefcase className="h-4.5 w-4.5 text-opportunity" /> :
                       r.type === 'task' ? <ListTodo className="h-4.5 w-4.5 text-warning" /> :
                       <Zap className="h-4.5 w-4.5 text-muted-foreground" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">
                        {query ? highlightMatch(r.title, query) : r.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">{r.subtitle}</span>
                        {r.price && r.price > 0 && (
                          <span className="text-[10px] text-muted-foreground/70 font-medium">{formatPrice(r.price)}</span>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1 shrink-0">
                      {r.temperature && TEMP_CONFIG[r.temperature] && (
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', `${TEMP_CONFIG[r.temperature].color} bg-muted/40`)}>
                          {TEMP_CONFIG[r.temperature].label}
                        </span>
                      )}
                      {r.meta === 'overdue' && (
                        <span className="text-[10px] font-semibold text-urgent px-1.5 py-0.5 rounded-md bg-urgent/10">Overdue</span>
                      )}
                      {r.riskLevel === 'red' && (
                        <span className="text-[10px] font-semibold text-urgent px-1.5 py-0.5 rounded-md bg-urgent/10">At Risk</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {/* Empty state when no query and showing defaults */}
            {!query && grouped.length > 0 && (
              <div className="px-4 py-4 text-center">
                <p className="text-xs text-muted-foreground/50">Start typing to search across everything</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Utility: highlight matching text
function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}
