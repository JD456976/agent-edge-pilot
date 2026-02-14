import { Badge } from '@/components/ui/badge';
import { ArrowDownToLine } from 'lucide-react';

interface ImportSourceBadgeProps {
  importedFrom?: string | null;
  importedAt?: string | null;
  importRunId?: string | null;
  compact?: boolean;
}

export function ImportSourceBadge({ importedFrom, importedAt, importRunId, compact = false }: ImportSourceBadgeProps) {
  if (!importedFrom) return null;

  const sourceLabel = importedFrom === 'fub' ? 'Follow Up Boss' : importedFrom;
  const timeLabel = importedAt
    ? new Date(importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  if (compact) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-primary/20 text-primary/80">
        <ArrowDownToLine className="h-2.5 w-2.5" />
        FUB
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline" className="text-[10px] gap-1 border-primary/20 text-primary/80">
        <ArrowDownToLine className="h-2.5 w-2.5" />
        {sourceLabel}
      </Badge>
      {timeLabel && <span>Imported {timeLabel}</span>}
      {importRunId && <span className="font-mono text-[10px]">Run {importRunId.slice(0, 8)}</span>}
    </div>
  );
}
