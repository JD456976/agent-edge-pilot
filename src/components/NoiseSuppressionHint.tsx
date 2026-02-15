import { useState } from 'react';
import { Info } from 'lucide-react';

interface Props {
  reason: string;
  lastShownAt?: string | null;
}

export function NoiseSuppressionHint({ reason, lastShownAt }: Props) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="text-[10px] text-muted-foreground/60">
      <button
        onClick={() => setShowDetail(v => !v)}
        className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
      >
        <Info className="h-2.5 w-2.5" />
        <span>Why is this quieter?</span>
      </button>
      {showDetail && (
        <div className="mt-1 pl-3.5 space-y-0.5">
          <p>{reason}</p>
          {lastShownAt && (
            <p>Last shown: {new Date(lastShownAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          )}
        </div>
      )}
    </div>
  );
}
