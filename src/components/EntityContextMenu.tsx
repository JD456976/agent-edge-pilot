import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Check, Clock, MessageSquare, Star, ExternalLink } from 'lucide-react';

interface EntityContextMenuProps {
  children: React.ReactNode;
  entityId: string;
  entityType: 'deal' | 'lead' | 'task';
  entityTitle: string;
  onComplete?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onLogTouch?: (entityType: 'deal' | 'lead', entityId: string, entityTitle: string) => void;
  onOpenDetail?: (id: string, type: 'deal' | 'lead' | 'task') => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

export function EntityContextMenu({
  children,
  entityId,
  entityType,
  entityTitle,
  onComplete,
  onSnooze,
  onLogTouch,
  onOpenDetail,
  onToggleFavorite,
  isFavorite,
}: EntityContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {onOpenDetail && (
          <ContextMenuItem onClick={() => onOpenDetail(entityId, entityType)}>
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Open details
          </ContextMenuItem>
        )}
        {onComplete && entityType === 'task' && (
          <ContextMenuItem onClick={() => onComplete(entityId)}>
            <Check className="h-3.5 w-3.5 mr-2" />
            Mark complete
          </ContextMenuItem>
        )}
        {onSnooze && (
          <ContextMenuItem onClick={() => onSnooze(entityId)}>
            <Clock className="h-3.5 w-3.5 mr-2" />
            Snooze
          </ContextMenuItem>
        )}
        {onLogTouch && (entityType === 'deal' || entityType === 'lead') && (
          <ContextMenuItem onClick={() => onLogTouch(entityType, entityId, entityTitle)}>
            <MessageSquare className="h-3.5 w-3.5 mr-2" />
            Log touch
          </ContextMenuItem>
        )}
        {onToggleFavorite && (entityType === 'deal' || entityType === 'lead') && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggleFavorite}>
              <Star className={`h-3.5 w-3.5 mr-2 ${isFavorite ? 'fill-gold text-gold' : ''}`} />
              {isFavorite ? 'Remove favorite' : 'Add to favorites'}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
