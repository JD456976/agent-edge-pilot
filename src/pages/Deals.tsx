import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Plus, ClipboardList, X, CalendarDays, Check, Archive,
  ChevronLeft, RotateCcw,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const LS_KEY = 'dealPilot_deals';

interface Deal {
  id: string;
  clientName: string;
  propertyAddress: string;
  salePrice: number;
  contractDate: string;
  closingDate: string;
  agentRole: 'buyer' | 'listing';
  stages: Record<string, boolean>;
  keyDates: Record<string, string>;
  archived: boolean;
  createdAt: string;
}

const STAGES = ['Contract', 'Inspection', 'Appraisal', 'Clear to Close', 'Closing'] as const;
const KEY_DATE_LABELS: Record<string, string> = {
  inspectionDeadline: 'Inspection Deadline',
  appraisalDue: 'Appraisal Due',
  loanApproval: 'Loan Approval',
  contingencyRemoval: 'Contingency Removal',
  finalWalkthrough: 'Final Walkthrough',
  closingDate: 'Closing Date',
};

function loadDeals(): Deal[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveDeals(d: Deal[]) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

function DaysToClose({ closingDate }: { closingDate: string }) {
  const days = differenceInDays(parseISO(closingDate), new Date());
  const color = days < 7 ? 'text-red-400' : days < 14 ? 'text-amber-400' : 'text-primary';
  return (
    <div className="text-center">
      <span className={cn('text-2xl font-bold tabular-nums', color)}>{Math.max(0, days)}</span>
      <span className="text-xs text-muted-foreground ml-1">days to close</span>
    </div>
  );
}

function StageProgress({
  stages,
  onToggle,
}: {
  stages: Record<string, boolean>;
  onToggle: (s: string) => void;
}) {
  const currentIdx = STAGES.findIndex((s) => !stages[s]);
  const currentStage = currentIdx === -1 ? null : STAGES[currentIdx];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0">
        {STAGES.map((s, i) => {
          const done = !!stages[s];
          return (
            <div key={s} className="flex items-center flex-1 last:flex-initial">
              <button
                onClick={() => onToggle(s)}
                className={cn(
                  'h-4 w-4 rounded-full border-2 shrink-0 transition-all',
                  done
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40 hover:border-primary/60'
                )}
                title={s}
              >
                {done && <Check className="h-3 w-3 text-primary-foreground mx-auto" />}
              </button>
              {i < STAGES.length - 1 && (
                <div className={cn('h-0.5 flex-1 mx-1', done ? 'bg-primary' : 'bg-muted-foreground/20')} />
              )}
            </div>
          );
        })}
      </div>
      {currentStage && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Current: <span className="text-foreground font-medium">{currentStage}</span>
          </span>
          <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => onToggle(currentStage)}>
            <Check className="h-3 w-3" /> Mark Done
          </Button>
        </div>
      )}
      {!currentStage && (
        <span className="text-xs text-emerald-400 font-medium">All stages complete ✓</span>
      )}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-xs font-medium text-foreground hover:text-primary transition-colors">
            {value ? format(parseISO(value), 'MMM d, yyyy') : 'Set date'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value ? parseISO(value) : undefined}
            onSelect={(d) => { if (d) { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); } }}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DealCard({ deal, onUpdate, onArchive }: { deal: Deal; onUpdate: (d: Deal) => void; onArchive: () => void }) {
  const toggleStage = (s: string) => {
    onUpdate({ ...deal, stages: { ...deal.stages, [s]: !deal.stages[s] } });
  };
  const updateKeyDate = (key: string, val: string) => {
    const updated = { ...deal, keyDates: { ...deal.keyDates, [key]: val } };
    if (key === 'closingDate') updated.closingDate = val;
    onUpdate(updated);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-foreground">{deal.clientName}</h3>
          <p className="text-xs text-muted-foreground">{deal.propertyAddress}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">
              {deal.agentRole === 'buyer' ? "Buyer's Agent" : 'Listing Agent'}
            </Badge>
            {deal.salePrice > 0 && (
              <span className="text-xs text-muted-foreground">${deal.salePrice.toLocaleString()}</span>
            )}
          </div>
        </div>
        <DaysToClose closingDate={deal.closingDate} />
      </div>

      <StageProgress stages={deal.stages} onToggle={toggleStage} />

      <div className="border-t border-border pt-3 space-y-0.5">
        {Object.entries(KEY_DATE_LABELS).map(([key, label]) => (
          <DateField
            key={key}
            label={label}
            value={deal.keyDates[key] || (key === 'closingDate' ? deal.closingDate : '')}
            onChange={(v) => updateKeyDate(key, v)}
          />
        ))}
      </div>

      <button
        onClick={onArchive}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
      >
        <Archive className="h-3 w-3" />
        {deal.archived ? 'Restore Deal' : 'Archive Deal'}
      </button>
    </div>
  );
}

export default function Deals() {
  const [deals, setDeals] = useState<Deal[]>(loadDeals);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [showNew, setShowNew] = useState(false);

  // Form state
  const [clientName, setClientName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [agentRole, setAgentRole] = useState<'buyer' | 'listing'>('buyer');

  useEffect(() => { saveDeals(deals); }, [deals]);

  const filtered = useMemo(
    () => deals.filter((d) => (tab === 'active' ? !d.archived : d.archived)),
    [deals, tab]
  );

  const handleCreate = () => {
    if (!clientName.trim() || !propertyAddress.trim() || !closingDate) return;
    const newDeal: Deal = {
      id: crypto.randomUUID(),
      clientName: clientName.trim(),
      propertyAddress: propertyAddress.trim(),
      salePrice: Number(salePrice.replace(/[^0-9]/g, '')) || 0,
      contractDate: contractDate || format(new Date(), 'yyyy-MM-dd'),
      closingDate,
      agentRole,
      stages: Object.fromEntries(STAGES.map((s) => [s, false])),
      keyDates: { closingDate },
      archived: false,
      createdAt: new Date().toISOString(),
    };
    setDeals((p) => [newDeal, ...p]);
    toast({ description: `${clientName} deal added` });
    resetForm();
  };

  const resetForm = () => {
    setShowNew(false);
    setClientName('');
    setPropertyAddress('');
    setSalePrice('');
    setContractDate('');
    setClosingDate('');
    setAgentRole('buyer');
  };

  const updateDeal = (updated: Deal) => {
    setDeals((p) => p.map((d) => (d.id === updated.id ? updated : d)));
  };

  const toggleArchive = (id: string) => {
    setDeals((p) => p.map((d) => (d.id === id ? { ...d, archived: !d.archived } : d)));
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Active Deals
          </h1>
          <p className="text-xs text-muted-foreground">Track every deal from contract to close</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> New Deal
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
        {(['active', 'archived'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'active' ? 'Active' : 'Archived'}
            {t === 'active' && deals.filter((d) => !d.archived).length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{deals.filter((d) => !d.archived).length}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Deal list */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {tab === 'active' ? 'No active deals yet.' : 'No archived deals.'}
          </p>
          {tab === 'active' && (
            <>
              <p className="text-xs text-muted-foreground/60 mb-4">When a lead goes under contract, add them here.</p>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5" /> New Deal
              </Button>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((deal) => (
          <DealCard key={deal.id} deal={deal} onUpdate={updateDeal} onArchive={() => toggleArchive(deal.id)} />
        ))}
      </div>

      {/* New Deal Bottom Sheet */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={resetForm} />
          <div className="relative w-full max-w-lg bg-card border-t border-border rounded-t-2xl p-5 space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">New Deal</h2>
              <button onClick={resetForm}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Client Name *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Property Address *</Label>
                <Input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="123 Oak Lane, Austin TX" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Sale Price</Label>
                <Input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="$450,000"
                  className="mt-1"
                  inputMode="numeric"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Contract Date</Label>
                  <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Closing Date *</Label>
                  <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Agent Role</Label>
                <div className="flex gap-2">
                  {(['buyer', 'listing'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAgentRole(r)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        agentRole === r
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {r === 'buyer' ? "Buyer's Agent" : 'Listing Agent'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!clientName.trim() || !propertyAddress.trim() || !closingDate}
              onClick={handleCreate}
            >
              Add Deal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
