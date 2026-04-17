import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommissionDefaultsModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const [rate, setRate] = useState(3);
  const [split, setSplit] = useState(100);
  const [referral, setReferral] = useState(0);
  const [typicalPrice, setTypicalPrice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('commission_defaults')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setRate(Number(data.default_commission_rate) || 3);
        setSplit(Number(data.default_split) || 100);
        setReferral(Number(data.default_referral_fee) || 0);
        setTypicalPrice((data as any).typical_price_mid ? Number((data as any).typical_price_mid) : null);
      }
    })();
  }, [open, user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    await supabase
      .from('commission_defaults')
      .upsert({
        user_id: user.id,
        default_commission_rate: rate,
        default_split: split,
        default_referral_fee: referral,
        typical_price_mid: typicalPrice,
      } as any, { onConflict: 'user_id' });
    setSaving(false);
    toast({ description: 'Commission defaults saved. New deals will use these values.' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Commission Defaults</DialogTitle>
          <DialogDescription>
            Set your typical commission details. These will auto-fill when you create new deals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Typical Commission Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="h-9"
              value={rate}
              onChange={e => setRate(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Typical Split (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              className="h-9"
              value={split}
              onChange={e => setSplit(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Typical Referral Fee (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              className="h-9"
              value={referral}
              onChange={e => setReferral(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Typical Deal Price ($)</Label>
            <Input
              type="number"
              min="0"
              className="h-9"
              placeholder="e.g. 350000"
              value={typicalPrice ?? ''}
              onChange={e => {
                const v = e.target.value;
                setTypicalPrice(v === '' ? null : parseFloat(v) || 0);
              }}
            />
            <p className="text-[10px] text-muted-foreground">Used to estimate lead commission potential.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Defaults'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
