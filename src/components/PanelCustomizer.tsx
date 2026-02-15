import { memo, useState, useCallback } from 'react';
import { GripVertical, Eye, EyeOff, RotateCcw, ChevronDown, Settings2, X } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRESETS, PANEL_LABELS, type PanelId, type PresetKey } from '@/hooks/useCommandCenterLayout';

// ── Sortable Row ──────────────────────────────────────────────────────
interface SortableRowProps {
  id: PanelId;
  isHidden: boolean;
  onToggle: () => void;
}

const SortableRow = memo(function SortableRow({ id, isHidden, onToggle }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
        isDragging && 'ring-2 ring-primary/30 bg-accent',
        isHidden ? 'opacity-50' : 'bg-card',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Drag to reorder ${PANEL_LABELS[id]}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <span className={cn('text-sm font-medium', isHidden && 'text-muted-foreground')}>
          {PANEL_LABELS[id]}
        </span>
      </div>

      <Switch
        checked={!isHidden}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${PANEL_LABELS[id]} visibility`}
        className="shrink-0"
      />
    </div>
  );
});

// ── Main Component ────────────────────────────────────────────────────
interface PanelCustomizerProps {
  open: boolean;
  onClose: () => void;
  panelOrder: PanelId[];
  hiddenPanels: Set<PanelId>;
  onReorder: (activeId: string, overId: string) => void;
  onToggleVisibility: (panelId: PanelId) => void;
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
  onShowAll: () => void;
  visibleCount: number;
  totalCount: number;
}

export const PanelCustomizer = memo(function PanelCustomizer({
  open,
  onClose,
  panelOrder,
  hiddenPanels,
  onReorder,
  onToggleVisibility,
  onApplyPreset,
  onReset,
  onShowAll,
  visibleCount,
  totalCount,
}: PanelCustomizerProps) {
  const [confirmPreset, setConfirmPreset] = useState<PresetKey | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(active.id as string, over.id as string);
  }, [onReorder]);

  const handleApplyPreset = useCallback((key: PresetKey) => {
    onApplyPreset(key);
    setConfirmPreset(null);
  }, [onApplyPreset]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] md:h-[70vh] md:max-w-lg md:mx-auto md:rounded-t-xl p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">Customize Panels</SheetTitle>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {visibleCount} of {totalCount} panels visible · Drag to reorder, toggle to show/hide
          </p>

          {/* Actions row */}
          <div className="flex items-center gap-2 pt-1 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                  Presets <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
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

            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={onShowAll}>
              <Eye className="h-3 w-3" />
              Show All
            </Button>

            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={onReset}>
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </SheetHeader>

        {/* Panel list */}
        <ScrollArea className="flex-1 px-3 py-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={panelOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {panelOrder.map(panelId => (
                  <SortableRow
                    key={panelId}
                    id={panelId}
                    isHidden={hiddenPanels.has(panelId)}
                    onToggle={() => onToggleVisibility(panelId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>

        {/* Preset confirmation inline */}
        {confirmPreset && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="bg-card border border-border rounded-xl p-5 max-w-sm w-full space-y-4 shadow-lg">
              <h3 className="text-base font-semibold">Apply "{PRESETS[confirmPreset].label}" preset?</h3>
              <p className="text-sm text-muted-foreground">
                This will update panel order and hide {PRESETS[confirmPreset].hiddenPanels.length} panels to focus on {PRESETS[confirmPreset].description.toLowerCase()}.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setConfirmPreset(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => handleApplyPreset(confirmPreset)}>
                  Apply Preset
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
});
