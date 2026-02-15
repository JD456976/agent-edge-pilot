import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertTriangle, Check, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

type ImportEntity = 'leads' | 'deals';

interface ParsedLead {
  name: string;
  source: string;
  engagementScore: number;
  leadTemperature?: 'cold' | 'warm' | 'hot';
  notes: string;
}

interface ParsedDeal {
  title: string;
  price: number;
  stage: 'offer' | 'offer_accepted' | 'pending' | 'closed';
  side: string;
  closeDate: string;
}

interface ParseError {
  row: number;
  field: string;
  message: string;
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

const LEAD_TEMPLATE = 'name,source,temperature,engagement_score,notes\nJohn Smith,Zillow,warm,65,Interested in 3BR homes\nJane Doe,Referral,hot,85,Ready to make an offer';
const DEAL_TEMPLATE = 'title,price,stage,side,close_date\n123 Main St,450000,pending,buy,2026-04-15\n456 Oak Ave,325000,offer,sell,2026-05-01';

function downloadTemplate(entity: ImportEntity) {
  const content = entity === 'leads' ? LEAD_TEMPLATE : DEAL_TEMPLATE;
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deal-pilot-${entity}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CSVImportModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const { refreshData } = useData();
  const [entity, setEntity] = useState<ImportEntity>('leads');
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [parsedDeals, setParsedDeals] = useState<ParsedDeal[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedLeads([]);
    setParsedDeals([]);
    setErrors([]);
    setImportedCount(0);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 2MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast({ title: 'Empty file', description: 'CSV must have a header row and at least one data row.', variant: 'destructive' });
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
      const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0));
      const parseErrors: ParseError[] = [];

      if (entity === 'leads') {
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'full_name' || h === 'contact_name');
        const sourceIdx = headers.findIndex(h => h === 'source' || h === 'lead_source');
        const tempIdx = headers.findIndex(h => h === 'temperature' || h === 'lead_temperature' || h === 'temp');
        const scoreIdx = headers.findIndex(h => h === 'engagement_score' || h === 'score' || h === 'engagement');
        const notesIdx = headers.findIndex(h => h === 'notes' || h === 'note' || h === 'comments');

        if (nameIdx === -1) {
          toast({ title: 'Missing column', description: 'CSV must have a "name" column.', variant: 'destructive' });
          return;
        }

        const leads: ParsedLead[] = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const name = row[nameIdx]?.trim();
          if (!name) { parseErrors.push({ row: i + 2, field: 'name', message: 'Name is required' }); continue; }

          const tempRaw = tempIdx >= 0 ? row[tempIdx]?.trim().toLowerCase() : '';
          const temp = tempRaw === 'hot' || tempRaw === 'warm' || tempRaw === 'cold' ? tempRaw : undefined;
          const score = scoreIdx >= 0 ? parseInt(row[scoreIdx]) || 0 : 0;

          leads.push({
            name,
            source: sourceIdx >= 0 ? row[sourceIdx]?.trim() || '' : '',
            leadTemperature: temp,
            engagementScore: Math.min(100, Math.max(0, score)),
            notes: notesIdx >= 0 ? row[notesIdx]?.trim() || '' : '',
          });
        }
        setParsedLeads(leads);
      } else {
        const titleIdx = headers.findIndex(h => h === 'title' || h === 'address' || h === 'property' || h === 'deal_name');
        const priceIdx = headers.findIndex(h => h === 'price' || h === 'sale_price' || h === 'amount');
        const stageIdx = headers.findIndex(h => h === 'stage' || h === 'status' || h === 'deal_stage');
        const sideIdx = headers.findIndex(h => h === 'side' || h === 'type' || h === 'deal_type');
        const closeIdx = headers.findIndex(h => h === 'close_date' || h === 'closing_date' || h === 'expected_close');

        if (titleIdx === -1) {
          toast({ title: 'Missing column', description: 'CSV must have a "title" or "address" column.', variant: 'destructive' });
          return;
        }

        const deals: ParsedDeal[] = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const title = row[titleIdx]?.trim();
          if (!title) { parseErrors.push({ row: i + 2, field: 'title', message: 'Title is required' }); continue; }

          const priceRaw = priceIdx >= 0 ? row[priceIdx]?.replace(/[$,]/g, '') : '0';
          const price = parseFloat(priceRaw) || 0;

          const stageRaw = stageIdx >= 0 ? row[stageIdx]?.trim().toLowerCase().replace(/\s+/g, '_') : 'offer';
          const validStages = ['offer', 'offer_accepted', 'pending', 'closed'];
          const stage = validStages.includes(stageRaw) ? stageRaw as ParsedDeal['stage'] : 'offer';

          const sideRaw = sideIdx >= 0 ? row[sideIdx]?.trim().toLowerCase() : 'buy';
          const side = sideRaw === 'sell' || sideRaw === 'listing' ? 'sell' : 'buy';

          const closeRaw = closeIdx >= 0 ? row[closeIdx]?.trim() : '';
          let closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          if (closeRaw) {
            const parsed = new Date(closeRaw);
            if (!isNaN(parsed.getTime())) closeDate = parsed.toISOString();
            else parseErrors.push({ row: i + 2, field: 'close_date', message: `Invalid date: "${closeRaw}", using default` });
          }

          deals.push({ title, price, stage, side, closeDate });
        }
        setParsedDeals(deals);
      }

      setErrors(parseErrors);
      setStep('preview');
    };
    reader.readAsText(file);
  }, [entity]);

  const handleImport = useCallback(async () => {
    if (!user?.id) return;
    setStep('importing');

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      let count = 0;

      if (entity === 'leads') {
        for (const lead of parsedLeads) {
          const { error } = await supabase.from('leads').insert({
            name: lead.name,
            source: lead.source,
            engagement_score: lead.engagementScore,
            lead_temperature: lead.leadTemperature || 'cold',
            notes: lead.notes,
            assigned_to_user_id: user.id,
            imported_from: 'csv',
            imported_at: new Date().toISOString(),
          });
          if (!error) count++;
        }
      } else {
        for (const deal of parsedDeals) {
          const { error } = await supabase.from('deals').insert({
            title: deal.title,
            price: deal.price,
            stage: deal.stage,
            side: deal.side,
            close_date: deal.closeDate,
            assigned_to_user_id: user.id,
            imported_from: 'csv',
            imported_at: new Date().toISOString(),
          });
          if (!error) count++;
        }
      }

      setImportedCount(count);
      setStep('done');
      await refreshData();
      toast({ description: `${count} ${entity} imported successfully.` });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
      setStep('preview');
    }
  }, [entity, parsedLeads, parsedDeals, user?.id, refreshData]);

  if (!open) return null;

  const previewData = entity === 'leads' ? parsedLeads : parsedDeals;
  const previewCount = previewData.length;

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10vh] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] bg-card border border-border rounded-2xl z-50 flex flex-col max-h-[80vh] shadow-xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Import from CSV</h2>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {step === 'upload' && (
              <>
                {/* Entity selector */}
                <div className="flex gap-2">
                  {(['leads', 'deals'] as const).map(e => (
                    <button
                      key={e}
                      onClick={() => setEntity(e)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${entity === e ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                      {e === 'leads' ? 'Leads' : 'Deals'}
                    </button>
                  ))}
                </div>

                {/* Template download */}
                <button
                  onClick={() => downloadTemplate(entity)}
                  className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-border hover:border-primary/30 transition-colors"
                >
                  <Download className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Download template</p>
                    <p className="text-xs text-muted-foreground">Get a pre-formatted CSV to fill out</p>
                  </div>
                </button>

                {/* File upload */}
                <div
                  className="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-border hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Click to upload CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 2MB · UTF-8 encoded</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Supported columns for {entity}:</p>
                  {entity === 'leads' ? (
                    <p>name (required), source, temperature, engagement_score, notes</p>
                  ) : (
                    <p>title (required), price, stage, side, close_date</p>
                  )}
                </div>
              </>
            )}

            {step === 'preview' && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{previewCount} {entity} ready to import</p>
                    {errors.length > 0 && (
                      <p className="text-xs text-warning flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> {errors.length} warning{errors.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{entity === 'leads' ? 'Leads' : 'Deals'}</Badge>
                </div>

                {/* Preview table */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          {entity === 'leads' ? (
                            <>
                              <th className="text-left p-2 font-medium">Name</th>
                              <th className="text-left p-2 font-medium">Source</th>
                              <th className="text-left p-2 font-medium">Temp</th>
                              <th className="text-left p-2 font-medium">Score</th>
                            </>
                          ) : (
                            <>
                              <th className="text-left p-2 font-medium">Title</th>
                              <th className="text-left p-2 font-medium">Price</th>
                              <th className="text-left p-2 font-medium">Stage</th>
                              <th className="text-left p-2 font-medium">Side</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(entity === 'leads' ? parsedLeads.slice(0, 10) : parsedDeals.slice(0, 10)).map((item, i) => (
                          <tr key={i} className="border-t border-border">
                            {entity === 'leads' ? (
                              <>
                                <td className="p-2">{(item as ParsedLead).name}</td>
                                <td className="p-2 text-muted-foreground">{(item as ParsedLead).source || '—'}</td>
                                <td className="p-2"><Badge variant="outline" className="text-[10px]">{(item as ParsedLead).leadTemperature || 'cold'}</Badge></td>
                                <td className="p-2 text-muted-foreground">{(item as ParsedLead).engagementScore}</td>
                              </>
                            ) : (
                              <>
                                <td className="p-2">{(item as ParsedDeal).title}</td>
                                <td className="p-2 text-muted-foreground">${((item as ParsedDeal).price || 0).toLocaleString()}</td>
                                <td className="p-2"><Badge variant="outline" className="text-[10px]">{(item as ParsedDeal).stage}</Badge></td>
                                <td className="p-2 text-muted-foreground">{(item as ParsedDeal).side}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewCount > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t border-border">
                      ...and {previewCount - 10} more
                    </p>
                  )}
                </div>

                {/* Warnings */}
                {errors.length > 0 && (
                  <div className="space-y-1">
                    {errors.slice(0, 5).map((err, i) => (
                      <p key={i} className="text-xs text-warning">Row {err.row}: {err.message}</p>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 'importing' && (
              <div className="flex flex-col items-center py-8">
                <span className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium">Importing {entity}...</p>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col items-center py-8">
                <div className="h-10 w-10 rounded-full bg-opportunity/10 flex items-center justify-center mb-3">
                  <Check className="h-5 w-5 text-opportunity" />
                </div>
                <p className="text-sm font-bold">{importedCount} {entity} imported</p>
                <p className="text-xs text-muted-foreground mt-1">Your data is ready in the Command Center.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-4 border-t border-border flex gap-2">
          {step === 'preview' && (
            <>
              <Button size="sm" variant="outline" className="flex-1" onClick={reset}>Back</Button>
              <Button size="sm" className="flex-1" onClick={handleImport} disabled={previewCount === 0}>
                Import {previewCount} {entity}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button size="sm" className="w-full" onClick={() => { reset(); onClose(); }}>Done</Button>
          )}
          {step === 'upload' && (
            <Button size="sm" variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          )}
        </div>
      </div>
    </>
  );
}
