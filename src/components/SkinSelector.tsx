import { useTheme, SKIN_META, type Skin } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Paintbrush } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const SKINS: Skin[] = ['command-center', 'luxury', 'field-agent'];

const SKIN_PREVIEWS: Record<Skin, { bg: string; accent: string; card: string }> = {
  'command-center': { bg: 'bg-[hsl(222,47%,7%)]', accent: 'bg-[hsl(243,75%,59%)]', card: 'bg-[hsl(222,41%,11%)]' },
  'luxury': { bg: 'bg-[hsl(0,0%,4%)]', accent: 'bg-[hsl(0,0%,100%)]', card: 'bg-[hsl(0,0%,8%)]' },
  'field-agent': { bg: 'bg-[hsl(45,25%,96%)]', accent: 'bg-[hsl(142,50%,36%)]', card: 'bg-[hsl(45,30%,99%)]' },
};

export function SkinSelector() {
  const { skin, setSkin } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Paintbrush className="h-3.5 w-3.5" />
          <span className="text-xs">Skin</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-semibold mb-3">Appearance</p>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {SKINS.map(s => {
            const meta = SKIN_META[s];
            const preview = SKIN_PREVIEWS[s];
            const active = skin === s;
            return (
              <button
                key={s}
                onClick={() => setSkin(s)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all duration-150',
                  active
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-muted/60'
                )}
              >
                {/* Mini preview swatch */}
                <div className={cn('w-10 h-10 rounded-md flex-shrink-0 relative overflow-hidden', preview.bg)}>
                  <div className={cn('absolute top-1.5 left-1.5 w-3 h-1.5 rounded-sm', preview.card)} />
                  <div className={cn('absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full', preview.accent)} />
                  <div className={cn('absolute bottom-1.5 left-1.5 right-1.5 h-2 rounded-sm', preview.card)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{meta.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
