import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edgeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Compass, Copy, ExternalLink, Link2, Mail, Search,
  Send, User, Clock, CheckCircle2, XCircle, Loader2, Plus, Trash2
} from 'lucide-react';
import { format } from 'date-fns';

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

export function MarketCompassPanel() {
  const { user } = useAuth();
  const { leads } = useData();
  const { toast } = useToast();

  const [clients, setClients] = useState<AgentClient[]>([]);
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClient, setNewClient] = useState({ first_name: '', last_name: '', email: '', phone: '' });
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

  const handleAddClient = async () => {
    if (!newClient.email.trim()) {
      toast({ title: 'Email required', description: 'Client email is needed to create a cross-app identity.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = await callEdgeFunction('upsert-client-identity', {
        first_name: newClient.first_name || null,
        last_name: newClient.last_name || null,
        email: newClient.email,
        phone: newClient.phone || null,
      });
      toast({ title: 'Client linked', description: `${newClient.first_name || newClient.email} is now connected across apps.` });
      setNewClient({ first_name: '', last_name: '', email: '', phone: '' });
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
      toast({ title: 'Report ID required', description: 'Enter the Market Compass session ID to share.', variant: 'destructive' });
      return;
    }
    setCreatingLink(true);
    try {
      const result = await callEdgeFunction<{ share_url: string; token_id: string; expires_at: string }>('create-report-share-link', {
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
      toast({ title: 'Link revoked', description: 'The share link has been deactivated.' });
      await fetchData();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to revoke link', variant: 'destructive' });
    }
  };

  const filteredClients = clients.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const ci = c.client_identities;
    return (
      ci.email_normalized?.includes(q) ||
      ci.first_name?.toLowerCase().includes(q) ||
      ci.last_name?.toLowerCase().includes(q)
    );
  });

  const getClientName = (ci: ClientIdentity) => {
    if (ci.first_name || ci.last_name) return `${ci.first_name || ''} ${ci.last_name || ''}`.trim();
    return ci.email_normalized;
  };

  const getTokenStatus = (token: ShareToken) => {
    if (token.revoked_at) return 'revoked';
    if (new Date(token.expires_at) < new Date()) return 'expired';
    return 'active';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Market Compass</h2>
          <p className="text-xs text-muted-foreground">Share offer intelligence reports with clients</p>
        </div>
      </div>

      {/* Clients Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" /> Linked Clients
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowAddClient(!showAddClient)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Client
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddClient && (
            <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">First Name</Label>
                  <Input
                    value={newClient.first_name}
                    onChange={e => setNewClient(p => ({ ...p, first_name: e.target.value }))}
                    placeholder="Jane"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Last Name</Label>
                  <Input
                    value={newClient.last_name}
                    onChange={e => setNewClient(p => ({ ...p, last_name: e.target.value }))}
                    placeholder="Smith"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input
                  type="email"
                  value={newClient.email}
                  onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={newClient.phone}
                  onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddClient} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Link Client
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddClient(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {clients.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search clients..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          )}

          {filteredClients.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {clients.length === 0 ? 'No clients linked yet. Add a client to get started.' : 'No clients match your search.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredClients.map(ac => {
                const ci = ac.client_identities;
                const isSelected = selectedClient === ac.client_identity_id;
                const clientTokens = shareTokens.filter(t => t.client_identity_id === ac.client_identity_id);

                return (
                  <div key={ac.id} className="rounded-lg border bg-card">
                    <button
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                      onClick={() => setSelectedClient(isSelected ? null : ac.client_identity_id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                          {(ci.first_name?.[0] || ci.email_normalized[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{getClientName(ci)}</p>
                          <p className="text-xs text-muted-foreground">{ci.email_normalized}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {clientTokens.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {clientTokens.filter(t => getTokenStatus(t) === 'active').length} active
                          </Badge>
                        )}
                        {ac.fub_contact_id && (
                          <Badge variant="outline" className="text-xs">FUB</Badge>
                        )}
                      </div>
                    </button>

                    {isSelected && (
                      <div className="px-3 pb-3 space-y-3">
                        <Separator />

                        {/* Share a report */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Share a Market Compass Report</Label>
                          <div className="flex gap-2">
                            <Input
                              value={sharingReportId}
                              onChange={e => setSharingReportId(e.target.value)}
                              placeholder="MC Session ID (from report URL)"
                              className="h-8 text-sm flex-1"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleCreateShareLink(ac.client_identity_id)}
                              disabled={creatingLink || !sharingReportId.trim()}
                            >
                              {creatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Paste the session ID from Market Compass (e.g. from the URL /share/abc-123-def)
                          </p>
                        </div>

                        {/* Open MC for new analysis */}
                        <a
                          href={`${MARKET_COMPASS_URL}/buyer?client_name=${encodeURIComponent(getClientName(ci))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
                        >
                          <Compass className="h-3.5 w-3.5" />
                          Create New Analysis in Market Compass
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </a>

                        {/* Existing share links */}
                        {clientTokens.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Shared Links</Label>
                            {clientTokens.map(token => {
                              const status = getTokenStatus(token);
                              return (
                                <div key={token.id} className="flex items-center justify-between p-2 rounded border bg-muted/30 text-xs">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {status === 'active' ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                    ) : status === 'revoked' ? (
                                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    <span className="truncate text-muted-foreground">
                                      {token.report_id.slice(0, 8)}...
                                    </span>
                                    <Badge variant={status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                                      {status}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 ml-2">
                                    {status === 'active' && token.share_url && (
                                      <>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleCopyLink(token.share_url!)}>
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleRevokeToken(token.id)}>
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick stats */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold">{clients.length}</p>
              <p className="text-[10px] text-muted-foreground">Clients</p>
            </div>
            <div>
              <p className="text-lg font-bold">{shareTokens.filter(t => getTokenStatus(t) === 'active').length}</p>
              <p className="text-[10px] text-muted-foreground">Active Links</p>
            </div>
            <div>
              <p className="text-lg font-bold">{shareTokens.length}</p>
              <p className="text-[10px] text-muted-foreground">Total Shares</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
