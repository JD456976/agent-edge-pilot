import { Flame } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DailyStreakBadgeProps {
  eodStreak: number;
  briefStreak: number;
}

export function DailyStreakBadge({ eodStreak, briefStreak }: DailyStreakBadgeProps) {
  const maxStreak = Math.max(eodStreak, briefStreak);
  if (maxStreak < 2) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
          maxStreak >= 7
            ? 'bg-warning/15 text-warning'
            : maxStreak >= 3
            ? 'bg-opportunity/15 text-opportunity'
            : 'bg-muted text-muted-foreground'
        )}>
          <Flame className={cn('h-3.5 w-3.5', maxStreak >= 7 && 'animate-pulse')} />
          {maxStreak}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-[200px]">
        <div className="space-y-0.5">
          <p className="font-medium">Daily Streak 🔥</p>
          {eodStreak > 0 && <p>End-of-day reviews: {eodStreak} day{eodStreak !== 1 ? 's' : ''}</p>}
          {briefStreak > 0 && <p>Morning briefs: {briefStreak} day{briefStreak !== 1 ? 's' : ''}</p>}
          <p className="text-muted-foreground">Keep it up!</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
