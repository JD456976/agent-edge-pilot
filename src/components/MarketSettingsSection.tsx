import { CloudSun, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MarketConditions, MarketTrend, InventoryTrend, DemandTrend, SeasonalPhase, DomTrend } from '@/lib/marketConditions';

interface Props {
  conditions: MarketConditions;
  onUpdate: (partial: Partial<MarketConditions>) => void;
  onReset: () => void;
}

export function MarketSettingsSection({ conditions, onUpdate, onReset }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <CloudSun className="h-4 w-4" /> Market Conditions
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Set current market signals to get pipeline-relevant guidance. No predictions about home prices — only how conditions affect your deals.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Interest Rate Trend</Label>
          <Select value={conditions.interestRateTrend} onValueChange={(v) => onUpdate({ interestRateTrend: v as MarketTrend })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rising">Rising</SelectItem>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="falling">Falling</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Inventory Trend</Label>
          <Select value={conditions.inventoryTrend} onValueChange={(v) => onUpdate({ inventoryTrend: v as InventoryTrend })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="increasing">Increasing</SelectItem>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="decreasing">Decreasing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Days on Market Trend</Label>
          <Select value={conditions.domTrend} onValueChange={(v) => onUpdate({ domTrend: v as DomTrend })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="increasing">Increasing</SelectItem>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="decreasing">Decreasing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Buyer Demand</Label>
          <Select value={conditions.buyerDemandTrend} onValueChange={(v) => onUpdate({ buyerDemandTrend: v as DemandTrend })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="strong">Strong</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="weak">Weak</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Seasonal Phase</Label>
          <Select value={conditions.seasonalPhase} onValueChange={(v) => onUpdate({ seasonalPhase: v as SeasonalPhase })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="peak">Peak Season</SelectItem>
              <SelectItem value="cooling">Cooling</SelectItem>
              <SelectItem value="off_season">Off-Season</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Last updated: {new Date(conditions.updatedAt).toLocaleDateString()}
        </p>
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs">
          <RotateCcw className="h-3 w-3 mr-1" /> Reset to Defaults
        </Button>
      </div>
    </section>
  );
}
