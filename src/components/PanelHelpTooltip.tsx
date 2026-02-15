import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

const PANEL_HELP: Record<PanelId, string> = {
  'autopilot': 'AI-suggested actions ranked by urgency and income impact. Autopilot learns from your decisions over time.',
  'prepared-actions': 'Pre-built action plans ready to execute. Review or launch them to save decision-making energy.',
  'execution-queue': 'Your current work queue -- items you have started but not finished yet.',
  'money-at-risk': 'Deals where commission is threatened by inactivity, missed milestones, or approaching deadlines.',
  'opportunity-heat': 'Leads ranked by conversion potential and estimated commission value.',
  'income-forecast': 'Projected income over the next 90 days based on your active pipeline and close probabilities.',
  'stability-score': 'A composite score measuring how resilient your income is to deal losses or market shifts.',
  'income-volatility': 'How much your projected income swings month-to-month. Lower is more predictable.',
  'pipeline-fragility': 'Risk of your pipeline collapsing if one or two key deals fall through.',
  'lead-decay': 'Leads losing engagement over time. Touch them before they go cold.',
  'operational-load': 'Your current workload relative to capacity -- helps prevent burnout or dropped balls.',
  'deal-failure': 'Deals showing patterns that historically lead to cancellation or loss.',
  'ghosting-risk': 'Leads who have stopped responding. Early intervention can recover these relationships.',
  'referral-conversion': 'Referral lead performance vs. other sources -- are your referrals converting?',
  'listing-performance': 'Active listing health: days on market, price adjustments, and showing activity.',
  'time-allocation': 'How you are spending time across deal stages. Highlights imbalances.',
  'opportunity-radar': 'Emerging opportunities you might be missing -- cross-sell, sphere, or seasonal.',
  'income-protection': 'Actions that reduce your exposure to income loss from at-risk deals.',
  'market-conditions': 'Local market signals -- inventory levels, price trends, and seasonality.',
  'learning-transparency': 'How the AI is learning from your behavior and what it is optimizing.',
  'network-benchmarks': 'Anonymous comparison with agents in similar markets and deal volumes.',
  'weekly-review': 'Weekly summary of wins, losses, and patterns to inform next week strategy.',
  'agent-profile': 'Your behavioral profile -- response patterns, preferred channels, and work rhythms.',
  'income-patterns': 'Historical income cycles showing seasonal trends and growth trajectory.',
  'market-signals': 'Real-time market indicators affecting your deals and pricing strategy.',
  'end-of-day': 'End-of-day sweep of unfinished items -- overdue tasks and untouched hot leads.',
};

interface Props {
  panelId?: PanelId;
  /** Inline text override — used when panelId isn't available */
  text?: string;
}

/** Panel help icon -- uses popover for richer content on mobile. */
export function PanelHelpTooltip({ panelId, text: inlineText }: Props) {
  const text = inlineText || (panelId ? PANEL_HELP[panelId] : undefined);
  if (!text) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 rounded-sm"
          aria-label="What is this panel?"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3 text-xs leading-relaxed text-muted-foreground">
        {text}
      </PopoverContent>
    </Popover>
  );
}

export { PANEL_HELP };
