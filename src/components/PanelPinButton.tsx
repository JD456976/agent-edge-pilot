import { Pin, PinOff } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PanelPinButtonProps {
  panelId: string;
  isPinned: boolean;
  onToggle: (panelId: string) => void;
}

export function PanelPinButton({ panelId, isPinned, onToggle }: PanelPinButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onToggle(panelId)}
          className={cn(
            'p-1 rounded-md transition-colors',
            isPinned
              ? 'text-primary hover:text-primary/80'
              : 'text-muted-foreground/40 hover:text-muted-foreground'
          )}
          aria-label={isPinned ? 'Unpin panel' : 'Pin panel to top'}
        >
          {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isPinned ? 'Unpin from top' : 'Pin to top (max 3)'}
      </TooltipContent>
    </Tooltip>
  );
}
