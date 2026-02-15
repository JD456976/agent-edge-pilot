import { ReactNode } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface MetricTooltipProps {
  value: ReactNode;
  explanation: string;
  children?: ReactNode;
}

/** Wrap any metric number/badge to show a plain-English hover explainer. */
export function MetricTooltip({ value, explanation, children }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/30">
          {children ?? value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}
