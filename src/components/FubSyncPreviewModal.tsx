import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { EdgeErrorDisplay } from '@/components/EdgeErrorDisplay';
import { type EdgeFunctionError } from '@/lib/edgeClient';

interface PreviewData {
  preview_leads: any[];
  preview_deals: any[];
  preview_tasks: any[];
  counts: { leads: number; deals: number; tasks: number };
}

interface FubSyncPreviewModalProps {
  open: boolean;
  onClose: () => void;
  data: PreviewData | null;
  loading: boolean;
  error: EdgeFunctionError | null;
}

export function FubSyncPreviewModal({ open, onClose, data, loading, error }: FubSyncPreviewModalProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync Preview</DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            Preview only. No data imported yet.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Fetching preview from Follow Up Boss…</span>
          </div>
        )}

        {error && <EdgeErrorDisplay error={error} functionName="fub-preview" />}

        {data && !loading && (
          <>
            <div className="flex gap-2 mb-3">
              <Badge variant="outline">{data.counts.leads} Leads</Badge>
              <Badge variant="outline">{data.counts.deals} Deals</Badge>
              <Badge variant="outline">{data.counts.tasks} Tasks</Badge>
            </div>

            <Tabs defaultValue="leads">
              <TabsList className="w-full">
                <TabsTrigger value="leads" className="flex-1">Leads</TabsTrigger>
                <TabsTrigger value="deals" className="flex-1">Deals</TabsTrigger>
                <TabsTrigger value="tasks" className="flex-1">Tasks</TabsTrigger>
              </TabsList>

              <TabsContent value="leads">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.preview_leads.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No leads found</TableCell></TableRow>
                    ) : data.preview_leads.map((l: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{l.email || '—'}</TableCell>
                        <TableCell className="text-xs">{l.source || '—'}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{l.stage || '—'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="deals">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.preview_deals.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No deals found</TableCell></TableRow>
                    ) : data.preview_deals.map((d: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell>${(d.price || 0).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{d.stage || '—'}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.person || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="tasks">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.preview_tasks.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No tasks found</TableCell></TableRow>
                    ) : data.preview_tasks.map((t: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-xs">{t.type || '—'}</TableCell>
                        <TableCell className="text-xs">{t.due_date || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={t.completed ? 'default' : 'outline'} className="text-xs">
                            {t.completed ? 'Done' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-muted-foreground hover:text-foreground mt-2 underline"
            >
              {showDetails ? 'Hide' : 'Show'} mapping details
            </button>
            {showDetails && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg font-mono space-y-1">
                <p>FUB people → preview_leads (name, email, phone, source, stage)</p>
                <p>FUB deals → preview_deals (name, price, stage, contact)</p>
                <p>FUB tasks → preview_tasks (title, type, due_date, completed)</p>
              </div>
            )}

            <Button disabled className="w-full mt-4" variant="outline">
              Ready to Import (Coming Soon)
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
