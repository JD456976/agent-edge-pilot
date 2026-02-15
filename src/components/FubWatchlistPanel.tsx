import { useState, useEffect, useCallback } from 'react';
import { Eye, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface WatchlistItem {
  id: string;
  entity_type: string;
  fub_id: string;
  entity_id?: string;
  label: string;
  created_at: string;
}

interface Props {
  hasIntegration: boolean;
}

export function FubWatchlistPanel({ hasIntegration }: Props) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWatchlist = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await (supabase.from('fub_watchlist' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10) as any);
    setItems((data || []) as WatchlistItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasIntegration) loadWatchlist();
    else setLoading(false);
  }, [hasIntegration, loadWatchlist]);

  const removeItem = useCallback(async (id: string) => {
    await supabase.from('fub_watchlist' as any).delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  if (!hasIntegration || (items.length === 0 && !loading)) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">FUB Watchlist</h2>
        <span className="text-xs text-muted-foreground ml-auto">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize shrink-0">
                  {item.entity_type}
                </span>
                <span className="text-sm text-muted-foreground truncate">{item.label}</span>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => removeItem(item.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
