import React, { memo, useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const DRAG_HINT_KEY = 'dp-drag-hint-shown';

interface SortablePanelProps {
  id: string;
  children: React.ReactNode;
  editMode: boolean;
  /** If true, this panel spans full width (not part of a grid pair) */
  fullWidth?: boolean;
}

export const SortablePanel = memo(function SortablePanel({ id, children, editMode, fullWidth }: SortablePanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode });

  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (editMode && !localStorage.getItem(DRAG_HINT_KEY)) {
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem(DRAG_HINT_KEY, 'true');
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowHint(false);
    }
  }, [editMode]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group/sortable',
        fullWidth && 'md:col-span-2',
        isDragging && 'ring-2 ring-primary/30 rounded-lg',
      )}
    >
      {editMode && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'absolute -left-1 top-3 z-10 p-1.5 rounded-md bg-muted/80 border border-border shadow-sm cursor-grab active:cursor-grabbing opacity-100 md:opacity-60 group-hover/sortable:opacity-100 transition-opacity hover:bg-accent touch-none',
            showHint && 'animate-pulse ring-2 ring-primary/50',
          )}
          aria-label="Drag to reorder panel"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {/* pointer-events: auto ensures card content is interactive even if parent has constraints */}
      <div className="pointer-events-auto">
        {children}
      </div>
    </div>
  );
});
