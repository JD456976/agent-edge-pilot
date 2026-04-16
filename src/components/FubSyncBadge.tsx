import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FubSyncBadgeProps {
  entityId: string;
  compact?: boolean;
}

interface SyncStatus {
  status: string;
  action: string;
  pushed_at: string;
  error_message: string | null;
}

export function FubSyncBadge({ entityId, compact = true }: FubSyncBadgeProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('fub_push_log')
      .select('status, action, pushed_at, error_message')
      .eq('entity_id', entityId)
      .order('pushed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setSyncStatus(data as SyncStatus | null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [entityId]);

  if (loading || !syncStatus) return null;

  const isSuccess = syncStatus.status === 'success';
  const Icon = isSuccess ? CheckCircle2 : XCircle;
  const timeAgo = getRelativeTime(syncStatus.pushed_at);

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded',
            isSuccess
              ? 'text-emerald-500'
              : 'text-destructive'
          )}>
            <Icon className="h-2.5 w-2.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-48">
          <p className="font-medium">
            FUB {syncStatus.action}: {isSuccess ? 'Synced' : 'Failed'}
          </p>
          <p className="text-muted-foreground">{timeAgo}</p>
          {syncStatus.error_message && (
            <p className="text-destructive mt-0.5">{syncStatus.error_message}</p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded border',
      isSuccess
        ? 'border-emerald-500/20 text-emerald-500'
        : 'border-destructive/20 text-destructive'
    )}>
      <Icon className="h-3 w-3" />
      <span>{isSuccess ? 'Synced' : 'Sync failed'}</span>
      <span className="text-muted-foreground">{timeAgo}</span>
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
