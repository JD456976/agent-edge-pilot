import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface Props {
  text: string;
}

/** Small "?" icon with a tooltip explaining what a panel does. */
export function PanelHelpTooltip({ text }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors" aria-label="What is this?">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
