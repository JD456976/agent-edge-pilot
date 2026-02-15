import { useState, useCallback } from 'react';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/hooks/use-toast';

type ExportFormat = 'csv' | 'json';
type ExportEntity = 'deals' | 'leads' | 'tasks' | 'all';

function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DataExportSection() {
  const { deals, leads, tasks } = useData();
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async (entity: ExportEntity, format: ExportFormat) => {
    setExporting(true);
    try {
      const datasets: { name: string; data: Record<string, unknown>[] }[] = [];

      if (entity === 'deals' || entity === 'all') {
        datasets.push({
          name: 'deals',
          data: deals.map(d => ({
            title: d.title, stage: d.stage, price: d.price, commission: d.commission,
            side: d.side, riskLevel: d.riskLevel, closeDate: d.closeDate,
            lastTouchedAt: d.lastTouchedAt || '', createdAt: d.createdAt,
          })),
        });
      }
      if (entity === 'leads' || entity === 'all') {
        datasets.push({
          name: 'leads',
          data: leads.map(l => ({
            name: l.name, source: l.source, engagementScore: l.engagementScore,
            lastContactAt: l.lastContactAt, temperature: l.leadTemperature || '',
            statusTags: (l.statusTags || []).join('; '), createdAt: l.createdAt,
          })),
        });
      }
      if (entity === 'tasks' || entity === 'all') {
        datasets.push({
          name: 'tasks',
          data: tasks.map(t => ({
            title: t.title, type: t.type,
            dueAt: t.dueAt, completedAt: t.completedAt || '',
            relatedLeadId: t.relatedLeadId || '', relatedDealId: t.relatedDealId || '',
          })),
        });
      }

      const timestamp = new Date().toISOString().slice(0, 10);

      for (const ds of datasets) {
        if (ds.data.length === 0) continue;
        if (format === 'json') {
          downloadFile(JSON.stringify(ds.data, null, 2), `deal-pilot-${ds.name}-${timestamp}.json`, 'application/json');
        } else {
          downloadFile(toCSV(ds.data), `deal-pilot-${ds.name}-${timestamp}.csv`, 'text/csv');
        }
      }

      const totalRows = datasets.reduce((s, d) => s + d.data.length, 0);
      toast({ description: `Exported ${totalRows} records as ${format.toUpperCase()}.` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    }
    setExporting(false);
  }, [deals, leads, tasks]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Download className="h-4 w-4" /> Data Export
      </h2>
      <p className="text-xs text-muted-foreground mb-3">Download your data for backup or analysis.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExport('all', 'csv')} disabled={exporting}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Export All (CSV)
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExport('all', 'json')} disabled={exporting}>
          <FileJson className="h-3.5 w-3.5 mr-1.5" /> Export All (JSON)
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {(['deals', 'leads', 'tasks'] as const).map(entity => (
          <button
            key={entity}
            onClick={() => handleExport(entity, 'csv')}
            disabled={exporting}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors capitalize underline-offset-2 hover:underline"
          >
            {entity} only
          </button>
        ))}
      </div>
    </section>
  );
}
