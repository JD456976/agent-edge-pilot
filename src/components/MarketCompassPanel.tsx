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
  LinkIcon, Share2, ChevronRight, Sparkles, Users, RefreshCw,
  Brain, MapPin, DollarSign, Home, Target, MessageSquare, AlertTriangle, TrendingUp, HelpCircle,
  FileText, ClipboardCopy
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

interface FubContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  fubId: string;
}

function AddClientForm({ onSave, onCancel, saving }: {
  onSave: (data: { first_name: string; last_name: string; email: string; phone: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [fubContacts, setFubContacts] = useState<FubContact[]>([]);
  const [loadingFub, setLoadingFub] = useState(false);
  const [fubLoaded, setFubLoaded] = useState(false);
  const [fubSearch, setFubSearch] = useState('');
  const [showFubPicker, setShowFubPicker] = useState(false);

  const loadFubContacts = useCallback(async () => {
    if (!user || fubLoaded) return;
    setLoadingFub(true);
    try {
      // Get FUB-imported leads with their staged data for email/phone
      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, source, imported_from')
        .like('imported_from', 'fub:%')
        .eq('assigned_to_user_id', user.id)
        .limit(200);

      if (!leads?.length) { setFubLoaded(true); setLoadingFub(false); return; }

      const fubIds = leads.map(l => l.imported_from!.replace('fub:', ''));
      const { data: staged } = await supabase
        .from('fub_staged_leads')
        .select('fub_id, normalized')
        .in('fub_id', fubIds);

      const stagedMap = new Map((staged || []).map(s => [s.fub_id, s.normalized as any]));

      const contacts: FubContact[] = leads.map(l => {
        const fubId = l.imported_from!.replace('fub:', '');
        const norm = stagedMap.get(fubId);
        return {
          id: l.id,
          name: l.name,
          email: norm?.email || '',
          phone: norm?.phone || '',
          source: l.source || '',
          fubId,
        };
      });
      setFubContacts(contacts);
      setFubLoaded(true);
    } catch (err) {
      console.error('Failed to load FUB contacts:', err);
    } finally {
      setLoadingFub(false);
    }
  }, [user, fubLoaded]);

  const handleImportFromFub = (contact: FubContact) => {
    const nameParts = contact.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    setForm({
      first_name: firstName,
      last_name: lastName,
      email: contact.email,
      phone: contact.phone,
    });
    setShowFubPicker(false);
  };

  const filteredFubContacts = useMemo(() => {
    if (!fubSearch) return fubContacts;
    const q = fubSearch.toLowerCase();
    return fubContacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.source.toLowerCase().includes(q)
    );
  }, [fubContacts, fubSearch]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 space-y-3">
        {/* Import from FUB */}
        <AnimatePresence mode="wait">
          {!showFubPicker ? (
            <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-chart-1/30 text-chart-1 hover:bg-chart-1/10"
                onClick={() => { setShowFubPicker(true); loadFubContacts(); }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Import from FUB
              </Button>
            </motion.div>
          ) : (
            <motion.div key="picker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 text-chart-1" /> Select FUB Contact
                </Label>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowFubPicker(false)}>
                  Manual Entry
                </Button>
              </div>
              {loadingFub ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-chart-1" />
                  <span className="text-xs text-muted-foreground ml-2">Loading FUB contacts…</span>
                </div>
              ) : fubContacts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No FUB-imported contacts found.</p>
              ) : (
                <>
                  {fubContacts.length > 5 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={fubSearch}
                        onChange={e => setFubSearch(e.target.value)}
                        placeholder="Search contacts…"
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border bg-background/50 p-1">
                    {filteredFubContacts.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-chart-1/10 transition-colors text-left"
                        onClick={() => handleImportFromFub(c)}
                      >
                        <div className="h-7 w-7 rounded-full bg-chart-1/15 flex items-center justify-center text-[10px] font-bold text-chart-1 shrink-0">
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{c.email || c.phone || c.source}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">FUB</Badge>
                      </button>
                    ))}
                    {filteredFubContacts.length === 0 && fubSearch && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">No matches</p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <Separator />

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

interface ClientAnalysis {
  summary?: string;
  client_type?: string;
  readiness_stage?: string;
  property_preferences?: {
    property_types?: string[];
    bedrooms?: string;
    bathrooms?: string;
    must_haves?: string[];
    deal_breakers?: string[];
    style_preferences?: string[];
  };
  location_preferences?: {
    preferred_areas?: string[];
    school_district_priority?: boolean;
    commute_considerations?: string;
    urban_suburban?: string;
  };
  budget?: {
    price_range_low?: number;
    price_range_high?: number;
    pre_approved?: string;
    financing_type?: string;
  };
  timeline?: {
    urgency?: string;
    target_move_date?: string;
    driving_event?: string;
  };
  communication_insights?: {
    preferred_channel?: string;
    responsiveness?: string;
    best_contact_time?: string;
    tone?: string;
  };
  key_concerns?: string[];
  recommended_actions?: string[];
  suggested_questions?: string[];
  evidence_quotes?: string[];
  confidence_level?: string;
  data_gaps?: string[];
}

function AnalysisSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function buildPlainTextReport(analysis: ClientAnalysis, clientName: string): string {
  const lines: string[] = [];
  lines.push(`CLIENT INTELLIGENCE REPORT — ${clientName}`);
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('─'.repeat(50));
  lines.push('');
  lines.push(`Type: ${analysis.client_type || 'Unknown'}  |  Stage: ${analysis.readiness_stage || 'Unknown'}  |  Confidence: ${analysis.confidence_level || 'N/A'}`);
  lines.push('');
  lines.push(analysis.summary || '');
  lines.push('');
  if (analysis.property_preferences) {
    lines.push('PROPERTY PREFERENCES');
    lines.push(`  Types: ${analysis.property_preferences.property_types?.join(', ') || 'Not specified'}`);
    lines.push(`  Bedrooms: ${analysis.property_preferences.bedrooms || 'N/A'}  |  Bathrooms: ${analysis.property_preferences.bathrooms || 'N/A'}`);
    if (analysis.property_preferences.must_haves?.length) lines.push(`  Must-haves: ${analysis.property_preferences.must_haves.join(', ')}`);
    if (analysis.property_preferences.deal_breakers?.length) lines.push(`  Deal-breakers: ${analysis.property_preferences.deal_breakers.join(', ')}`);
    lines.push('');
  }
  if (analysis.location_preferences?.preferred_areas?.length) {
    lines.push(`LOCATION: ${analysis.location_preferences.preferred_areas.join(', ')}`);
    lines.push('');
  }
  if (analysis.budget && (analysis.budget.price_range_low || analysis.budget.price_range_high)) {
    const lo = analysis.budget.price_range_low ? `$${(analysis.budget.price_range_low / 1000).toFixed(0)}K` : '?';
    const hi = analysis.budget.price_range_high ? `$${(analysis.budget.price_range_high / 1000).toFixed(0)}K` : '?';
    lines.push(`BUDGET: ${lo} – ${hi}  |  Pre-approved: ${analysis.budget.pre_approved || 'Unknown'}  |  Financing: ${analysis.budget.financing_type || 'N/A'}`);
    lines.push('');
  }
  if (analysis.timeline) {
    lines.push(`TIMELINE: ${analysis.timeline.urgency || 'Unknown'} urgency${analysis.timeline.driving_event ? ` — ${analysis.timeline.driving_event}` : ''}`);
    lines.push('');
  }
  if (analysis.recommended_actions?.length) {
    lines.push('RECOMMENDED NEXT STEPS');
    analysis.recommended_actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
    lines.push('');
  }
  if (analysis.suggested_questions?.length) {
    lines.push('QUESTIONS TO ASK');
    analysis.suggested_questions.forEach(q => lines.push(`  • ${q}`));
    lines.push('');
  }
  if (analysis.key_concerns?.length) {
    lines.push(`KEY CONCERNS: ${analysis.key_concerns.join(' · ')}`);
    lines.push('');
  }
  if (analysis.data_gaps?.length) {
    lines.push(`DATA GAPS: ${analysis.data_gaps.join(' · ')}`);
  }
  return lines.join('\n');
}

function AnalysisDisplay({ analysis, updatedAt, onRefresh, refreshing, clientName, clientEmail }: {
  analysis: ClientAnalysis;
  updatedAt: string;
  onRefresh: () => void;
  refreshing: boolean;
  clientName: string;
  clientEmail: string;
}) {
  const { toast } = useToast();
  const confidenceColor = analysis.confidence_level === 'high' ? 'text-chart-2' : analysis.confidence_level === 'medium' ? 'text-chart-4' : 'text-destructive';
  const stageLabel: Record<string, string> = {
    exploring: '🔍 Exploring', actively_searching: '🏠 Actively Searching',
    ready_to_offer: '📝 Ready to Offer', under_contract: '📋 Under Contract', unknown: '❓ Unknown',
  };

  const formatPrice = (n?: number) => n ? `$${(n / 1000).toFixed(0)}K` : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="text-[10px] bg-primary/15 text-primary border-primary/20">
            {analysis.client_type === 'buyer' ? '🏡 Buyer' : analysis.client_type === 'seller' ? '💰 Seller' : analysis.client_type === 'both' ? '🔄 Buy & Sell' : analysis.client_type === 'investor' ? '📈 Investor' : '❓ Unknown'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stageLabel[analysis.readiness_stage || 'unknown']}
          </Badge>
          <Badge variant="secondary" className={`text-[10px] ${confidenceColor}`}>
            {analysis.confidence_level} confidence
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[10px]" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <p className="text-xs leading-relaxed bg-primary/5 border border-primary/10 rounded-lg p-3">
        {analysis.summary}
      </p>

      {/* Property Preferences */}
      {analysis.property_preferences && (
        <AnalysisSection icon={Home} title="Property Preferences">
          <div className="flex flex-wrap gap-1.5">
            {analysis.property_preferences.property_types?.map(t => (
              <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
            ))}
            {analysis.property_preferences.bedrooms && <Badge variant="secondary" className="text-[10px]">{analysis.property_preferences.bedrooms} bed</Badge>}
            {analysis.property_preferences.bathrooms && <Badge variant="secondary" className="text-[10px]">{analysis.property_preferences.bathrooms} bath</Badge>}
          </div>
          {(analysis.property_preferences.must_haves?.length ?? 0) > 0 && (
            <div className="mt-1.5">
              <span className="text-[10px] font-medium text-chart-2">Must-haves: </span>
              {analysis.property_preferences.must_haves!.join(', ')}
            </div>
          )}
          {(analysis.property_preferences.deal_breakers?.length ?? 0) > 0 && (
            <div>
              <span className="text-[10px] font-medium text-destructive">Deal-breakers: </span>
              {analysis.property_preferences.deal_breakers!.join(', ')}
            </div>
          )}
        </AnalysisSection>
      )}

      {/* Location */}
      {analysis.location_preferences && (analysis.location_preferences.preferred_areas?.length ?? 0) > 0 && (
        <AnalysisSection icon={MapPin} title="Location Preferences">
          <div className="flex flex-wrap gap-1.5">
            {analysis.location_preferences.preferred_areas?.map(a => (
              <Badge key={a} variant="outline" className="text-[10px] border-chart-1/30 text-chart-1">{a}</Badge>
            ))}
          </div>
          {analysis.location_preferences.commute_considerations && (
            <p className="mt-1">{analysis.location_preferences.commute_considerations}</p>
          )}
        </AnalysisSection>
      )}

      {/* Budget */}
      {analysis.budget && (analysis.budget.price_range_low || analysis.budget.price_range_high) && (
        <AnalysisSection icon={DollarSign} title="Budget">
          <div className="flex items-center gap-2">
            {formatPrice(analysis.budget.price_range_low) && formatPrice(analysis.budget.price_range_high) && (
              <Badge className="text-[10px] bg-chart-2/15 text-chart-2 border-chart-2/20">
                {formatPrice(analysis.budget.price_range_low)} – {formatPrice(analysis.budget.price_range_high)}
              </Badge>
            )}
            {analysis.budget.pre_approved === 'yes' && <Badge variant="secondary" className="text-[10px] text-chart-2">✓ Pre-approved</Badge>}
            {analysis.budget.financing_type && <Badge variant="outline" className="text-[10px]">{analysis.budget.financing_type}</Badge>}
          </div>
        </AnalysisSection>
      )}

      {/* Timeline */}
      {analysis.timeline && analysis.timeline.urgency !== 'unknown' && (
        <AnalysisSection icon={Clock} title="Timeline">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${analysis.timeline.urgency === 'urgent' ? 'border-destructive/30 text-destructive' : ''}`}>
              {analysis.timeline.urgency}
            </Badge>
            {analysis.timeline.target_move_date && <span>{analysis.timeline.target_move_date}</span>}
          </div>
          {analysis.timeline.driving_event && <p className="mt-1">Driving event: {analysis.timeline.driving_event}</p>}
        </AnalysisSection>
      )}

      {/* Recommended Actions */}
      {(analysis.recommended_actions?.length ?? 0) > 0 && (
        <AnalysisSection icon={Target} title="Recommended Actions">
          <ul className="space-y-1">
            {analysis.recommended_actions!.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ChevronRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {/* Key Concerns */}
      {(analysis.key_concerns?.length ?? 0) > 0 && (
        <AnalysisSection icon={AlertTriangle} title="Key Concerns">
          <ul className="space-y-0.5">
            {analysis.key_concerns!.map((c, i) => <li key={i}>• {c}</li>)}
          </ul>
        </AnalysisSection>
      )}

      {/* Suggested Questions */}
      {(analysis.suggested_questions?.length ?? 0) > 0 && (
        <AnalysisSection icon={HelpCircle} title="Questions to Ask">
          <ul className="space-y-0.5">
            {analysis.suggested_questions!.map((q, i) => <li key={i}>❓ {q}</li>)}
          </ul>
        </AnalysisSection>
      )}

      {/* Evidence */}
      {(analysis.evidence_quotes?.length ?? 0) > 0 && (
        <AnalysisSection icon={MessageSquare} title="Evidence from Communications">
          <div className="space-y-1">
            {analysis.evidence_quotes!.slice(0, 3).map((q, i) => (
              <p key={i} className="italic border-l-2 border-primary/30 pl-2 py-0.5">"{q}"</p>
            ))}
          </div>
        </AnalysisSection>
      )}

      {/* Data Gaps */}
      {(analysis.data_gaps?.length ?? 0) > 0 && (
        <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2">
          <span className="font-medium">Data gaps:</span> {analysis.data_gaps!.join(' · ')}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1 gap-2 bg-gradient-to-r from-chart-1 to-chart-2 hover:from-chart-1/90 hover:to-chart-2/90 text-white border-0"
          onClick={() => {
            const text = buildPlainTextReport(analysis, clientName);
            navigator.clipboard.writeText(text);
            toast({ title: 'Report copied!', description: 'Paste it into an email, text, or notes to share with your client.' });
          }}
        >
          <ClipboardCopy className="h-4 w-4" />
          Copy Full Report
        </Button>
        <Button
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={() => {
            const text = buildPlainTextReport(analysis, clientName);
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${clientName.replace(/\s+/g, '_')}_Client_Report.txt`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Report downloaded!' });
          }}
        >
          <FileText className="h-4 w-4" />
          Export
        </Button>
      </div>

      <p className="text-[9px] text-muted-foreground text-right">
        Updated {new Date(updatedAt).toLocaleDateString()} · Generated from FUB data
      </p>
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
  const { toast } = useToast();
  const ci = client.client_identities;
  const activeCount = tokens.filter(t => getTokenStatus(t) === 'active').length;
  const clientName = getClientName(ci);
  const initial = (ci.first_name?.[0] || ci.email_normalized[0]).toUpperCase();

  const [analysis, setAnalysis] = useState<ClientAnalysis | null>(null);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const generateAnalysis = useCallback(async (forceRefresh = false) => {
    setGenerating(true);
    try {
      const result = await callEdgeFunction<{ analysis: ClientAnalysis; cached: boolean; updated_at: string; activity_count?: number }>('client-analysis', {
        client_identity_id: client.client_identity_id,
        force_refresh: forceRefresh,
      });
      setAnalysis(result.analysis);
      setAnalysisUpdatedAt(result.updated_at);
      setShowAnalysis(true);
      if (result.cached) {
        toast({ title: 'Loaded cached analysis', description: 'Click Refresh to regenerate with latest data.' });
      } else {
        toast({ title: 'Analysis complete', description: `Generated from ${result.activity_count || 0} FUB interactions.` });
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate analysis';
      toast({ title: 'Analysis Error', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [client.client_identity_id, toast]);

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

              {/* AI Analysis */}
              {!showAnalysis ? (
                <Button
                  onClick={() => generateAnalysis(false)}
                  disabled={generating}
                  className="w-full gap-2 bg-gradient-to-r from-chart-1 to-chart-2 hover:from-chart-1/90 hover:to-chart-2/90 text-white border-0"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing FUB data…
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4" />
                      Analyze FUB Data
                    </>
                  )}
                </Button>
              ) : analysis ? (
                <AnalysisDisplay
                  analysis={analysis}
                  updatedAt={analysisUpdatedAt}
                  onRefresh={() => generateAnalysis(true)}
                  refreshing={generating}
                  clientName={clientName}
                  clientEmail={ci.email_normalized}
                />
              ) : null}

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
