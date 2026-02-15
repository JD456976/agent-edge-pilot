import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

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

  if (!connected) return null;

  const label = lastSync
    ? `FUB synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
    : 'FUB connected';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <div className="relative">
            <RefreshCw className="h-3 w-3" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
          <span className="truncate">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : 'Connected to Follow Up Boss'}
      </TooltipContent>
    </Tooltip>
  );
}
