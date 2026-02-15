import { useState, memo } from 'react';
import { LayoutGrid, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRESETS, type PresetKey } from '@/hooks/usePanelLayout';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface PanelLayoutControlsProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  editMode,
  onToggleEdit,
  onApplyPreset,
  onReset,
}: PanelLayoutControlsProps) {
  const [confirmPreset, setConfirmPreset] = useState<PresetKey | null>(null);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={editMode ? 'default' : 'ghost'}
          className="h-7 text-xs gap-1.5"
          onClick={onToggleEdit}
        >
          <LayoutGrid className="h-3 w-3" />
          {editMode ? 'Done' : 'Edit Layout'}
        </Button>

        {editMode && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  Presets <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(PRESETS) as PresetKey[]).map(key => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => setConfirmPreset(key)}
                  >
                    <div>
                      <p className="text-sm font-medium">{PRESETS[key].label}</p>
                      <p className="text-xs text-muted-foreground">{PRESETS[key].description}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </>
        )}
      </div>

      {/* Preset confirmation dialog */}
      <Dialog open={!!confirmPreset} onOpenChange={() => setConfirmPreset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply Preset</DialogTitle>
            <DialogDescription>
              This will replace your current panel order with the "{confirmPreset && PRESETS[confirmPreset].label}" preset. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmPreset(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirmPreset) onApplyPreset(confirmPreset);
                setConfirmPreset(null);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
