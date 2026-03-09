import { useState, useEffect, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function TargetMarketSettings() {
  const [zipCodes, setZipCodes] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('target_zip_codes, target_min_price').eq('user_id', user.id).single();
      if (data) {
        setZipCodes((data as any).target_zip_codes || '');
        setMinPrice((data as any).target_min_price ? String((data as any).target_min_price) : '');
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await supabase.from('profiles').update({
      target_zip_codes: zipCodes.trim(),
      target_min_price: minPrice ? parseFloat(minPrice) : null,
    } as any).eq('user_id', user.id);
    toast({ description: 'Target market saved.' });
    setSaving(false);
  }, [zipCodes, minPrice]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4" /> My Target Market
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Leads outside your target area or price range will be flagged with an "Outside Target" badge.
      </p>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Preferred ZIP Codes</Label>
          <Input
            placeholder="e.g. 78701, 78702, 78704"
            value={zipCodes}
            onChange={e => setZipCodes(e.target.value)}
            className="h-10 mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated. Leave blank to show all leads.</p>
        </div>
        <div>
          <Label className="text-xs">Minimum Price</Label>
          <Input
            type="number"
            placeholder="e.g. 250000"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            className="h-10 mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Leads below this price will be flagged. Leave blank to skip.</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-10 min-h-[44px]">
          {saving ? 'Saving…' : 'Save Target Market'}
        </Button>
      </div>
    </section>
  );
}
