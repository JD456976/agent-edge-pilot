import { X, AlertTriangle, ArrowRight, Clock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import type { SyncConflict } from '@/hooks/useAutoSync';

interface Props {
  conflicts: SyncConflict[];
  onResolve: (conflict: SyncConflict, choice: 'keep_fub' | 'keep_dp') => void;
  onDismiss: (conflict: SyncConflict) => void;
  onClose: () => void;
}

function ConflictCard({ conflict, onResolve, onDismiss }: {
  conflict: SyncConflict;
  onResolve: (choice: 'keep_fub' | 'keep_dp') => void;
  onDismiss: () => void;
}) {
  const [choice, setChoice] = useState<'keep_fub' | 'keep_dp' | ''>('');
  const isNewInFub = conflict.differences.some(d => d.field === 'new_in_fub');

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-semibold">{conflict.entity_name}</span>
          <Badge variant="outline" className="text-[10px]">{conflict.entity_type}</Badge>
        </div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-accent transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>FUB: {conflict.fub_updated_at ? formatDistanceToNow(new Date(conflict.fub_updated_at), { addSuffix: true }) : 'unknown'}</span>
          {conflict.newer === 'fub' && <Badge className="text-[9px] px-1 py-0 bg-primary/20 text-primary border-0">Newer</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>DP: {conflict.dp_updated_at ? formatDistanceToNow(new Date(conflict.dp_updated_at), { addSuffix: true }) : 'unknown'}</span>
          {conflict.newer === 'dp' && <Badge className="text-[9px] px-1 py-0 bg-primary/20 text-primary border-0">Newer</Badge>}
        </div>
      </div>

      {/* Differences */}
      {!isNewInFub ? (
        <div className="space-y-2">
          {conflict.differences.map((diff, i) => (
            <div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
              <span className="font-medium text-foreground capitalize">{diff.field}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground">FUB:</span>
                <span className="font-mono">{String(diff.fub_value || '—')}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">DP:</span>
                <span className="font-mono">{String(diff.dp_value || '—')}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This item exists in both systems but isn't linked. Choose which version to keep or link them.
        </p>
      )}

      {/* Resolution */}
      <div className="flex items-center gap-2">
        <Select value={choice} onValueChange={(v) => setChoice(v as any)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Choose which to keep…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keep_fub">
              Keep FUB version {conflict.newer === 'fub' ? '(newer)' : ''}
            </SelectItem>
            <SelectItem value="keep_dp">
              Keep Deal Pilot version {conflict.newer === 'dp' ? '(newer)' : ''}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!choice}
          onClick={() => { if (choice) onResolve(choice); }}
          className="shrink-0"
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Apply
        </Button>
      </div>
    </div>
  );
}

export function SyncConflictDrawer({ conflicts, onResolve, onDismiss, onClose }: Props) {
  if (conflicts.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-[28rem] bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Sync Conflicts ({conflicts.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These items differ between FUB and Deal Pilot. Pick which to keep.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {conflicts.map((c, i) => (
            <ConflictCard
              key={`${c.entity_id}-${c.fub_id}-${i}`}
              conflict={c}
              onResolve={(choice) => onResolve(c, choice)}
              onDismiss={() => onDismiss(c)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
