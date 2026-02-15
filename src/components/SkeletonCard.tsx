import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="card-elevated p-4 space-y-3"
    >
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center gap-3"
        >
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </motion.div>
      ))}
    </motion.div>
  );
}
