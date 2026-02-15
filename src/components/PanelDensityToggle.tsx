import { useState } from 'react';
import { Rows3, Rows4 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type PanelDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'dp-panel-density';

function readDensity(): PanelDensity {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'compact') return 'compact';
  } catch {}
  return 'comfortable';
}

export function usePanelDensity() {
  const [density, setDensity] = useState<PanelDensity>(readDensity);

  const toggleDensity = () => {
    setDensity(prev => {
      const next: PanelDensity = prev === 'comfortable' ? 'compact' : 'comfortable';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  };

  return { density, toggleDensity };
}

export function PanelDensityToggle({ density, onToggle }: { density: PanelDensity; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggle}
          aria-label={density === 'comfortable' ? 'Switch to compact view' : 'Switch to comfortable view'}
        >
          {density === 'comfortable' ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {density === 'comfortable' ? 'Compact view' : 'Comfortable view'}
      </TooltipContent>
    </Tooltip>
  );
}
