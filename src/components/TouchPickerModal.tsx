import { useState, useMemo } from 'react';
import { Search, User2, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useData } from '@/contexts/DataContext';
import type { Lead, Deal } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (entityType: 'lead' | 'deal', entityId: string, entityTitle: string) => void;
}

export function TouchPickerModal({ open, onClose, onSelect }: Props) {
  const { leads, deals } = useData();
  const [tab, setTab] = useState<'lead' | 'deal'>('lead');
  const [search, setSearch] = useState('');

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return leads.slice(0, 12);
    return leads.filter(l => l.name.toLowerCase().includes(q)).slice(0, 12);
  }, [leads, search]);

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'closed'), [deals]);
  const filteredDeals = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return activeDeals.slice(0, 12);
    return activeDeals.filter(d => d.title.toLowerCase().includes(q)).slice(0, 12);
  }, [activeDeals, search]);

  const handleSelect = (entityType: 'lead' | 'deal', id: string, title: string) => {
    onSelect(entityType, id, title);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setSearch(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Log a Touch</DialogTitle>
          <DialogDescription className="text-xs">Select a lead or deal to log a touch for.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => { setTab(v as 'lead' | 'deal'); setSearch(''); }}>
          <TabsList className="w-full">
            <TabsTrigger value="lead" className="flex-1 gap-1.5 text-xs">
              <User2 className="h-3.5 w-3.5" /> Lead
            </TabsTrigger>
            <TabsTrigger value="deal" className="flex-1 gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5" /> Deal
            </TabsTrigger>
          </TabsList>

          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'lead' ? 'Search leads...' : 'Search deals...'}
              className="pl-8 text-sm h-9"
              autoFocus
            />
          </div>

          <TabsContent value="lead" className="mt-2 max-h-60 overflow-y-auto">
            {filteredLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No leads found</p>
            ) : (
              <div className="space-y-0.5">
                {filteredLeads.map(l => (
                  <button
                    key={l.id}
                    onClick={() => handleSelect('lead', l.id, l.name)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.source}</p>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="deal" className="mt-2 max-h-60 overflow-y-auto">
            {filteredDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No deals found</p>
            ) : (
              <div className="space-y-0.5">
                {filteredDeals.map(d => (
                  <button
                    key={d.id}
                    onClick={() => handleSelect('deal', d.id, d.title)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{d.stage.replace('_', ' ')}</p>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
