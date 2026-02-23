import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edgeClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Compass, Copy, ExternalLink, Send, User, Clock,
  CheckCircle2, XCircle, Loader2, Plus, Trash2, Search,
  LinkIcon, Share2, ChevronRight, Sparkles, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MARKET_COMPASS_URL = 'https://market-compass.lovable.app';

interface ClientIdentity {
  id: string;
  email_normalized: string;
  email_original: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface AgentClient {
  id: string;
  client_identity_id: string;
  fub_contact_id: string | null;
  client_identities: ClientIdentity;
}

interface ShareToken {
  id: string;
  report_id: string;
  report_type: string;
  share_url: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  client_identity_id: string;
}

// --- Sub-components ---

function StatCard({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function TokenStatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge className="text-[10px] bg-chart-2/15 text-chart-2 border-chart-2/20 hover:bg-chart-2/20">Active</Badge>;
  if (status === 'revoked') return <Badge variant="destructive" className="text-[10px]">Revoked</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Expired</Badge>;
}

function EmptyClientsState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-10 px-4"
    >
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Users className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-sm font-semibold mb-1">No clients linked yet</h3>
      <p className="text-xs text-muted-foreground max-w-[260px] mb-4">
        Link a client to start sharing Market Compass offer intelligence reports with them.
      </p>
      <Button size="sm" onClick={onAdd} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Link Your First Client
      </Button>
    </motion.div>
  );
}

function AddClientForm({ onSave, onCancel, saving }: {
  onSave: (data: { first_name: string; last_name: string; email: string; phone: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">First Name</Label>
            <Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Jane" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Last Name</Label>
            <Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Smith" className="h-8 text-sm" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@example.com" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" className="h-8 text-sm" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.email.trim()} className="flex-1 gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
            Link Client
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </motion.div>
  );
}

function ClientCard({ client, tokens, isExpanded, onToggle, onShareReport, onCopyLink, onRevokeToken, sharingReportId, setSharingReportId, creatingLink }: {
  client: AgentClient;
  tokens: ShareToken[];
  isExpanded: boolean;
  onToggle: () => void;
  onShareReport: (clientIdentityId: string) => void;
  onCopyLink: (url: string) => void;
  onRevokeToken: (tokenId: string) => void;
  sharingReportId: string;
  setSharingReportId: (v: string) => void;
  creatingLink: boolean;
}) {
  const ci = client.client_identities;
  const activeCount = tokens.filter(t => getTokenStatus(t) === 'active').length;
  const clientName = getClientName(ci);
  const initial = (ci.first_name?.[0] || ci.email_normalized[0]).toUpperCase();

  return (
    <motion.div layout className="rounded-xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-bold text-primary border border-primary/10">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{clientName}</p>
            <p className="text-xs text-muted-foreground truncate">{ci.email_normalized}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Share2 className="h-2.5 w-2.5" /> {activeCount}
            </Badge>
          )}
          {client.fub_contact_id && (
            <Badge variant="outline" className="text-[10px]">FUB</Badge>
          )}
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-4 space-y-3">
              <Separator />

              {/* Share a report */}
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Send className="h-3 w-3" /> Share a Report
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={sharingReportId}
                    onChange={e => setSharingReportId(e.target.value)}
                    placeholder="Paste MC Session ID…"
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => onShareReport(client.client_identity_id)}
                    disabled={creatingLink || !sharingReportId.trim()}
                    className="h-8 px-3"
                  >
                    {creatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  From a Market Compass report URL, paste the session ID (e.g. abc-123-def).
                </p>
              </div>

              {/* Open MC for new analysis */}
              <a
                href={`${MARKET_COMPASS_URL}/buyer?client_name=${encodeURIComponent(clientName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Create New Analysis in Market Compass
                <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
              </a>

              {/* Existing share links */}
              {tokens.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Shared Links</Label>
                  {tokens.map(token => {
                    const status = getTokenStatus(token);
                    return (
                      <div key={token.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {status === 'active' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-chart-2 shrink-0" />
                          ) : status === 'revoked' ? (
                            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate text-muted-foreground font-mono">
                            {token.report_id.length > 12 ? `${token.report_id.slice(0, 12)}…` : token.report_id}
                          </span>
                          <TokenStatusBadge status={status} />
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 ml-2">
                          {status === 'active' && token.share_url && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onCopyLink(token.share_url!)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onRevokeToken(token.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- Helpers ---

function getClientName(ci: ClientIdentity) {
  if (ci.first_name || ci.last_name) return `${ci.first_name || ''} ${ci.last_name || ''}`.trim();
  return ci.email_normalized;
}

function getTokenStatus(token: ShareToken) {
  if (token.revoked_at) return 'revoked';
  if (new Date(token.expires_at) < new Date()) return 'expired';
  return 'active';
}

// --- Main Panel ---

export function MarketCompassPanel() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [clients, setClients] = useState<AgentClient[]>([]);
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharingReportId, setSharingReportId] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [clientsRes, tokensRes] = await Promise.all([
        supabase
          .from('agent_clients')
          .select('id, client_identity_id, fub_contact_id, client_identities(*)')
          .eq('agent_user_id', user.id),
        supabase
          .from('report_share_tokens')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (clientsRes.data) setClients(clientsRes.data as any);
      if (tokensRes.data) setShareTokens(tokensRes.data as any);
    } catch (err) {
      console.error('Failed to load MC data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddClient = async (data: { first_name: string; last_name: string; email: string; phone: string }) => {
    if (!data.email.trim()) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await callEdgeFunction('upsert-client-identity', {
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        email: data.email,
        phone: data.phone || null,
      });
      toast({ title: 'Client linked', description: `${data.first_name || data.email} is now connected across apps.` });
      setShowAddClient(false);
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to add client', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateShareLink = async (clientIdentityId: string) => {
    if (!sharingReportId.trim()) {
      toast({ title: 'Report ID required', variant: 'destructive' });
      return;
    }
    setCreatingLink(true);
    try {
      await callEdgeFunction<{ share_url: string; token_id: string; expires_at: string }>('create-report-share-link', {
        report_id: sharingReportId.trim(),
        client_identity_id: clientIdentityId,
      });
      toast({ title: 'Share link created', description: 'The report link is ready to send.' });
      setSharingReportId('');
      setSelectedClient(null);
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to create share link', variant: 'destructive' });
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied', description: 'Share link copied to clipboard.' });
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      await supabase
        .from('report_share_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId);
      toast({ title: 'Link revoked' });
      await fetchData();
    } catch {
      toast({ title: 'Error', description: 'Failed to revoke link', variant: 'destructive' });
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter(c => {
      const ci = c.client_identities;
      return ci.email_normalized?.includes(q) || ci.first_name?.toLowerCase().includes(q) || ci.last_name?.toLowerCase().includes(q);
    });
  }, [clients, searchQuery]);

  const activeTokenCount = useMemo(() => shareTokens.filter(t => getTokenStatus(t) === 'active').length, [shareTokens]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Loading client data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Market Compass</h2>
            <p className="text-xs text-muted-foreground">Share offer intelligence reports with clients</p>
          </div>
        </div>
        {clients.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowAddClient(!showAddClient)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Client</span>
          </Button>
        )}
      </div>

      {/* Stats */}
      {clients.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard value={clients.length} label="Linked Clients" icon={Users} />
          <StatCard value={activeTokenCount} label="Active Links" icon={Share2} />
          <StatCard value={shareTokens.length} label="Total Shares" icon={LinkIcon} />
        </div>
      )}

      {/* Add Client Form */}
      <AnimatePresence>
        {showAddClient && (
          <AddClientForm onSave={handleAddClient} onCancel={() => setShowAddClient(false)} saving={saving} />
        )}
      </AnimatePresence>

      {/* Client List */}
      {clients.length === 0 && !showAddClient ? (
        <EmptyClientsState onAdd={() => setShowAddClient(true)} />
      ) : (
        <>
          {clients.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search clients…"
                className="pl-9 h-9 text-sm"
              />
            </div>
          )}

          {filteredClients.length === 0 && searchQuery ? (
            <p className="text-xs text-muted-foreground text-center py-6">No clients match "{searchQuery}"</p>
          ) : (
            <div className="space-y-2">
              {filteredClients.map(ac => (
                <ClientCard
                  key={ac.id}
                  client={ac}
                  tokens={shareTokens.filter(t => t.client_identity_id === ac.client_identity_id)}
                  isExpanded={selectedClient === ac.client_identity_id}
                  onToggle={() => setSelectedClient(selectedClient === ac.client_identity_id ? null : ac.client_identity_id)}
                  onShareReport={handleCreateShareLink}
                  onCopyLink={handleCopyLink}
                  onRevokeToken={handleRevokeToken}
                  sharingReportId={sharingReportId}
                  setSharingReportId={setSharingReportId}
                  creatingLink={creatingLink}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
