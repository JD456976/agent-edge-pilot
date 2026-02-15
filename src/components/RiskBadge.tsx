import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  className?: string;
}

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; dot: string; defaultLabel: string }> = {
  red: { bg: 'bg-urgent/10', text: 'text-urgent', dot: 'bg-urgent', defaultLabel: 'High Risk' },
  yellow: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning', defaultLabel: 'At Risk' },
  green: { bg: 'bg-opportunity/10', text: 'text-opportunity', dot: 'bg-opportunity', defaultLabel: 'On Track' },
};

/** Consistent risk badge used across all panels. */
export function RiskBadge({ level, label, className }: RiskBadgeProps) {
  const style = RISK_STYLES[level];
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
      style.bg, style.text, className
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {label ?? style.defaultLabel}
    </span>
  );
}
