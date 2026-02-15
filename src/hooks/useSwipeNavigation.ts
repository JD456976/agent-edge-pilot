import { useRef, useCallback, useEffect } from 'react';
import { useWorkspace, type WorkspaceType } from '@/contexts/WorkspaceContext';

const WORKSPACE_ORDER: (WorkspaceType | null)[] = [null, 'work', 'sync', 'insights', 'settings'];
const SWIPE_THRESHOLD = 80;

export function useSwipeNavigation(enabled: boolean) {
  const { activeWorkspace, openWorkspace, closeWorkspace } = useWorkspace();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleSwipe = useCallback((deltaX: number) => {
    const currentIndex = WORKSPACE_ORDER.indexOf(activeWorkspace);
    if (currentIndex === -1) return;

    if (deltaX < -SWIPE_THRESHOLD) {
      // Swipe left → next
      const nextIndex = Math.min(currentIndex + 1, WORKSPACE_ORDER.length - 1);
      const next = WORKSPACE_ORDER[nextIndex];
      if (next) openWorkspace(next);
      else closeWorkspace();
    } else if (deltaX > SWIPE_THRESHOLD) {
      // Swipe right → prev
      const prevIndex = Math.max(currentIndex - 1, 0);
      const prev = WORKSPACE_ORDER[prevIndex];
      if (prev) openWorkspace(prev);
      else closeWorkspace();
    }
  }, [activeWorkspace, openWorkspace, closeWorkspace]);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      // Only horizontal swipes
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        handleSwipe(deltaX);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, handleSwipe]);
}
