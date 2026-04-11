import { useState, useCallback } from 'react';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Lead } from '@/types';

const DEALS_KEY = 'dealPilot_deals';
const UC_KEY = 'dealPilot_underContract';

function loadDeals(): any[] {
  try { return JSON.parse(localStorage.getItem(DEALS_KEY) || '[]'); } catch { return []; }
}
function saveDeals(deals: any[]) {
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
}
function loadUnderContract(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(UC_KEY) || '[]')); } catch { return new Set(); }
}
function saveUnderContract(ids: Set<string>) {
  localStorage.setItem(UC_KEY, JSON.stringify([...ids]));
}

export function isUnderContract(leadId: string): boolean {
  return loadUnderContract().has(leadId);
}

export function UnderContractBadge({ leadId }: { leadId: string }) {
  if (!isUnderContract(leadId)) return null;
  return (
    <Badge variant="outline" className="text-[9px] border-opportunity/40 text-opportunity bg-opportunity/10 gap-0.5">
      <Home className="h-2 w-2" /> Under Contract
    </Badge>
  );
}

interface UnderContractSheetProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function UnderContractSheet({ lead, open, onClose, onComplete }: UnderContractSheetProps) {
  const [salePrice, setSalePrice] = useState('');
  const [closingDate, setClosingDate] = useState('');

  const handleSubmit = useCallback(() => {
    const price = parseFloat(salePrice.replace(/[^0-9.]/g, ''));
    if (!price || price <= 0) {
      toast.error('Enter a valid sale price');
      return;
    }
    if (!closingDate) {
      toast.error('Select a closing date');
      return;
    }

    // Create deal in localStorage
    const deals = loadDeals();
    const newDeal = {
      id: crypto.randomUUID(),
      clientName: lead.name,
      propertyAddress: (lead.notes || '').match(/\d+\s+\w+/)?.[0] || '',
      salePrice: price,
      closingDate,
      agentRole: 'Buyer',
      createdAt: new Date().toISOString(),
      milestones: { contract: 'complete', inspection: 'pending', appraisal: 'pending', clearToClose: 'pending', closing: 'pending' },
      archived: false,
    };
    deals.push(newDeal);
    saveDeals(deals);

    // Mark lead as under contract
    const uc = loadUnderContract();
    uc.add(lead.id);
    saveUnderContract(uc);

    toast.success(`${lead.name} added to Active Deals`);
    setSalePrice('');
    setClosingDate('');
    onClose();
    onComplete?.();
  }, [lead, salePrice, closingDate, onClose, onComplete]);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[60vh]">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-opportunity" /> Mark Under Contract
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">{lead.name}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sale Price</label>
            <Input
              placeholder="$350,000"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              className="h-11 text-sm"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Closing Date</label>
            <Input
              type="date"
              value={closingDate}
              onChange={e => setClosingDate(e.target.value)}
              className="h-11 text-sm"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <Button className="w-full h-11" onClick={handleSubmit}>
            Add to Active Deals
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
