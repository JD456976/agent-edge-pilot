import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

export type CommissionType = 'percentage' | 'flat';

export interface CommissionValues {
  commissionType: CommissionType;
  commissionRate: number;    // percentage (e.g. 3 = 3%)
  flatAmount: number;        // flat dollar amount
  splitPercent: number;      // user's split (default 100)
  referralFeePercent: number;
  overrideAmount: number | null;
  notes: string;
}

interface Props {
  price: number;
  values: CommissionValues;
  onChange: (values: CommissionValues) => void;
  showWarning?: boolean;
}

const DEFAULT_VALUES: CommissionValues = {
  commissionType: 'percentage',
  commissionRate: 3,
  flatAmount: 0,
  splitPercent: 100,
  referralFeePercent: 0,
  overrideAmount: null,
  notes: '',
};

export function getDefaultCommissionValues(): CommissionValues {
  return { ...DEFAULT_VALUES };
}

export async function loadUserDefaults(userId: string): Promise<Partial<CommissionValues>> {
  const { data } = await supabase
    .from('commission_defaults' as any)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return {};
  return {
    commissionRate: Number((data as any).default_commission_rate) || 3,
    splitPercent: Number((data as any).default_split) || 100,
    referralFeePercent: Number((data as any).default_referral_fee) || 0,
  };
}

export async function saveUserDefaults(userId: string, values: CommissionValues): Promise<void> {
  await supabase
    .from('commission_defaults' as any)
    .upsert({
      user_id: userId,
      default_commission_rate: values.commissionRate,
      default_split: values.splitPercent,
      default_referral_fee: values.referralFeePercent,
    } as any, { onConflict: 'user_id' });
}

export function computeGrossCommission(price: number, values: CommissionValues): number {
  if (values.commissionType === 'percentage') {
    return Math.round(price * (values.commissionRate / 100));
  }
  return values.flatAmount;
}

export function computePersonalFromCapture(price: number, values: CommissionValues): number {
  if (values.overrideAmount !== null && values.overrideAmount > 0) {
    return values.overrideAmount;
  }
  const gross = computeGrossCommission(price, values);
  const afterReferral = gross * (1 - (values.referralFeePercent || 0) / 100);
  return Math.round(afterReferral * (values.splitPercent / 100));
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString()}`;
}

export function CommissionCapture({ price, values, onChange, showWarning }: Props) {
  const [showOptional, setShowOptional] = useState(false);

  const grossCommission = computeGrossCommission(price, values);
  const personalCommission = computePersonalFromCapture(price, values);
  const hasCommission = personalCommission > 0;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Your Commission for This Deal
        </Label>
        {hasCommission && (
          <span className="text-xs font-medium text-opportunity">{formatCurrency(personalCommission)}</span>
        )}
      </div>

      {/* Commission Type */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Commission Type</Label>
          <Select
            value={values.commissionType}
            onValueChange={(v: CommissionType) => onChange({ ...values, commissionType: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">% of Price</SelectItem>
              <SelectItem value="flat">Flat Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {values.commissionType === 'percentage' ? (
          <div className="space-y-1">
            <Label className="text-xs">Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="h-8 text-xs"
              value={values.commissionRate || ''}
              onChange={e => onChange({ ...values, commissionRate: parseFloat(e.target.value) || 0 })}
              placeholder="3.0"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">Amount ($)</Label>
            <Input
              type="number"
              min="0"
              className="h-8 text-xs"
              value={values.flatAmount || ''}
              onChange={e => onChange({ ...values, flatAmount: parseFloat(e.target.value) || 0 })}
              placeholder="10000"
            />
          </div>
        )}
      </div>

      {/* Split */}
      <div className="space-y-1">
        <Label className="text-xs">Your Split (%)</Label>
        <Input
          type="number"
          min="0"
          max="100"
          className="h-8 text-xs"
          value={values.splitPercent || ''}
          onChange={e => onChange({ ...values, splitPercent: parseFloat(e.target.value) || 0 })}
          placeholder="100"
        />
      </div>

      {/* Summary line */}
      {price > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
          <span>Gross: {formatCurrency(grossCommission)}</span>
          {values.referralFeePercent > 0 && (
            <span>After referral: {formatCurrency(Math.round(grossCommission * (1 - values.referralFeePercent / 100)))}</span>
          )}
          <span className="font-medium text-foreground">You: {formatCurrency(personalCommission)}</span>
        </div>
      )}

      {/* Optional section */}
      <button
        type="button"
        onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showOptional ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Optional details
      </button>

      {showOptional && (
        <div className="space-y-3 pl-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Referral Fee (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                className="h-8 text-xs"
                value={values.referralFeePercent || ''}
                onChange={e => onChange({ ...values, referralFeePercent: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Override ($)</Label>
              <Input
                type="number"
                min="0"
                className="h-8 text-xs"
                value={values.overrideAmount ?? ''}
                onChange={e => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  onChange({ ...values, overrideAmount: val });
                }}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input
              className="h-8 text-xs"
              value={values.notes}
              onChange={e => onChange({ ...values, notes: e.target.value })}
              placeholder="Commission notes..."
            />
          </div>
        </div>
      )}

      {/* Warning */}
      {showWarning && !hasCommission && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground border-l-2 border-warning/40 pl-3 py-1">
          <Info className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <span>Your personal commission is not set. Financial insights will be limited.</span>
        </div>
      )}
    </div>
  );
}
