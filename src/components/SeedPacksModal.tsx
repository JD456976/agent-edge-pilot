import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { SEED_PACKS, type SeedPackId } from '@/data/seedPacks';
import { DollarSign, Zap, TrendingUp, Shield, RefreshCw, Activity, Star, Package, Trash2, AlertTriangle } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  DollarSign, Zap, TrendingUp, Shield, RefreshCw, Activity, Star,
};

interface SeedPacksModalProps {
  open: boolean;
  onClose: () => void;
  onSeed: (packIds: SeedPackId[]) => Promise<void>;
  onClearSeeded: () => Promise<void>;
  hasRealData: boolean;
  hasSeededData: boolean;
}

export function SeedPacksModal({ open, onClose, onSeed, onClearSeeded, hasRealData, hasSeededData }: SeedPacksModalProps) {
  const [selected, setSelected] = useState<Set<SeedPackId>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const toggle = (id: SeedPackId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === SEED_PACKS.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(SEED_PACKS.map(p => p.id)));
    }
  };

  const handleSeed = async () => {
    if (selected.size === 0) return;
    if (hasRealData) {
      const ok = window.confirm('Real data exists. Seed packs will be added alongside it. Continue?');
      if (!ok) return;
    }
    setSeeding(true);
    try {
      await onSeed(Array.from(selected));
      setSelected(new Set());
      onClose();
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await onClearSeeded();
      setShowClearConfirm(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Seed Packs
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-4">
          Select scenario packs to seed. Each exercises specific Command Center panels. Records are tagged for selective cleanup.
        </p>

        {/* Select all */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={selectAll} className="text-xs text-primary hover:underline">
            {selected.size === SEED_PACKS.length ? 'Deselect all' : 'Select all'}
          </button>
          <Badge variant="secondary" className="text-xs">{selected.size} selected</Badge>
        </div>

        {/* Pack list */}
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {SEED_PACKS.map(pack => {
            const Icon = ICON_MAP[pack.icon] || Package;
            const isSelected = selected.has(pack.id);
            return (
              <label
                key={pack.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/30'
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(pack.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">{pack.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{pack.description}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div>
            {hasSeededData && !showClearConfirm && (
              <Button size="sm" variant="outline" onClick={() => setShowClearConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Seeded Data
              </Button>
            )}
            {showClearConfirm && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive">Remove all seeded records?</span>
                <Button size="sm" variant="destructive" onClick={handleClear} disabled={clearing}>
                  {clearing ? 'Clearing…' : 'Yes, Clear'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowClearConfirm(false)}>No</Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSeed} disabled={selected.size === 0 || seeding}>
              {seeding ? 'Seeding…' : `Seed ${selected.size} Pack${selected.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
