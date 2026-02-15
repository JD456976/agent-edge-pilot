import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Compass, Clock, DollarSign, Shield, ListChecks } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { StrategicOverview } from '@/lib/strategicEngine';

interface Props {
  open: boolean;
  onClose: () => void;
  overview: StrategicOverview | null;
}

export function WeeklyPlanningAssistant({ open, onClose, overview }: Props) {
  if (!overview) return null;

  const plan = overview.weeklyPlan;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Compass className="h-5 w-5 text-primary" />
            Weekly Plan
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Strategic guidance for the week based on your pipeline and targets.
          </p>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Current Mode Context */}
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Mode</p>
            <p className="text-sm font-semibold">{overview.modeLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{overview.modeDescription}</p>
          </div>

          {/* Key Priorities */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ListChecks className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wider">Key Priorities</p>
            </div>
            {plan.priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
                <span className="text-sm">{p}</span>
              </div>
            ))}
          </div>

          {/* Time Allocation */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wider">Suggested Time Allocation</p>
            </div>
            {plan.timeAllocations.map((item, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{item.category}</span>
                  <span className="text-xs text-muted-foreground">{item.percent}%</span>
                </div>
                <Progress value={item.percent} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>

          {/* Income-Driving Actions */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-opportunity" />
              <p className="text-xs font-semibold uppercase tracking-wider">Income-Driving Actions</p>
            </div>
            {plan.incomeActions.map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-opportunity">•</span>
                <span>{action}</span>
              </div>
            ))}
          </div>

          {/* Risk-Reduction Actions */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-warning" />
              <p className="text-xs font-semibold uppercase tracking-wider">Risk-Reduction Actions</p>
            </div>
            {plan.riskActions.map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-warning">•</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
