import { useRef, useState, useEffect, type ReactNode } from 'react';
import { SkeletonCard } from '@/components/SkeletonCard';

interface LazyPanelProps {
  children: ReactNode;
  /** Number of skeleton lines to show before mounting */
  skeletonLines?: number;
  /** Root margin for IntersectionObserver (default "200px") */
  rootMargin?: string;
}

export function LazyPanel({ children, skeletonLines = 3, rootMargin = '200px' }: LazyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
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
  }, [hasBeenVisible, rootMargin]);

  return (
    <div ref={ref}>
      {hasBeenVisible ? children : <SkeletonCard lines={skeletonLines} />}
    </div>
  );
}
