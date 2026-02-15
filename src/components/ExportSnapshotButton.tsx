import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface ExportSnapshotButtonProps {
  totalRevenue: number;
  totalMoneyAtRisk: number;
  stabilityScore: number;
  overdueCount: number;
  activeDeals: number;
  momentum: string;
}

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

export function ExportSnapshotButton({
  totalRevenue,
  totalMoneyAtRisk,
  stabilityScore,
  overdueCount,
  activeDeals,
  momentum,
}: ExportSnapshotButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const text = [
      `📊 Deal Pilot Snapshot — ${today}`,
      '',
      `Revenue in play: ${formatCurrency(totalRevenue)}`,
      `Money at risk: ${formatCurrency(totalMoneyAtRisk)}`,
      `Stability score: ${stabilityScore}/100`,
      `Active deals: ${activeDeals}`,
      `Overdue tasks: ${overdueCount}`,
      `Momentum: ${momentum}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [totalRevenue, totalMoneyAtRisk, stabilityScore, overdueCount, activeDeals, momentum]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 w-7 p-0" aria-label="Copy dashboard snapshot">
          {copied ? <Check className="h-3.5 w-3.5 text-opportunity" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {copied ? 'Copied!' : 'Copy snapshot to clipboard'}
      </TooltipContent>
    </Tooltip>
  );
}
