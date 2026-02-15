import { useRef, useState, useEffect, type ReactNode } from 'react';
import { SkeletonCard } from '@/components/SkeletonCard';

interface LazyPanelProps {
  children: ReactNode;
  /** Number of skeleton lines to show before mounting */
  skeletonLines?: number;
  /** Root margin for IntersectionObserver (default "200px") */
  rootMargin?: string;
  /** When true, skip lazy loading and render immediately (e.g. during drag) */
  forceMount?: boolean;
}

export function LazyPanel({ children, skeletonLines = 3, rootMargin = '200px', forceMount }: LazyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (forceMount) {
      setHasBeenVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBeenVisible, rootMargin, forceMount]);

  return (
    <div ref={ref}>
      {hasBeenVisible ? children : <SkeletonCard lines={skeletonLines} />}
    </div>
  );
}
