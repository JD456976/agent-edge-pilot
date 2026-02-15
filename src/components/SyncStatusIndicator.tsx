import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'critical';

function getFreshness(lastSync: string | null): FreshnessLevel {
  if (!lastSync) return 'critical';
  const diffMin = (Date.now() - new Date(lastSync).getTime()) / 60000;
  if (diffMin < 30) return 'fresh';       // < 30 min
  if (diffMin < 120) return 'recent';      // < 2 hrs
  if (diffMin < 480) return 'stale';       // < 8 hrs
  return 'critical';                       // 8+ hrs
}

const FRESHNESS_CONFIG: Record<FreshnessLevel, { dotClass: string; label: string }> = {
  fresh:    { dotClass: 'bg-opportunity',  label: 'Synced recently' },
  recent:   { dotClass: 'bg-warning',      label: 'Synced a while ago' },
  stale:    { dotClass: 'bg-urgent',       label: 'Sync is getting stale' },
  critical: { dotClass: 'bg-urgent',       label: 'Sync overdue' },
};

export function SyncStatusIndicator() {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: integration } = await (supabase.from('crm_integrations' as any)
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle() as any);

      if (integration?.status === 'connected') {
        setConnected(true);
        const { data: syncState } = await (supabase.from('fub_sync_state' as any)
          .select('last_successful_check_at')
          .eq('user_id', user.id)
          .maybeSingle() as any);

        if (syncState?.last_successful_check_at) {
          setLastSync(syncState.last_successful_check_at);
        }
      }
    })();
  }, []);

  // Re-evaluate freshness every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [connected]);

  if (!connected) return null;

  const freshness = getFreshness(lastSync);
  const config = FRESHNESS_CONFIG[freshness];

  const label = lastSync
    ? `FUB synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
    : 'FUB connected — no sync yet';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <div className="relative">
            <RefreshCw className="h-3 w-3" />
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full',
                config.dotClass,
                freshness === 'critical' && 'animate-pulse'
              )}
            />
          </div>
          <span className="truncate">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs space-y-1">
        <p className="font-medium">{config.label}</p>
        <p>{lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : 'No successful sync recorded'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
