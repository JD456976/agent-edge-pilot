import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Check, Circle, Clock, Home, Phone, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

type StageStatus = 'done' | 'active' | 'pending';

interface DealStage {
  label: string;
  date?: string;
  responsible: string;
  status: StageStatus;
  note?: string;
}

interface PortalData {
  client_name: string;
  property_address: string;
  price: number;
  current_stage: string;
  agent_name: string;
  agent_initials: string;
  agent_phone: string | null;
  agent_email: string | null;
  stages: DealStage[];
  updated_at: string;
}

// Mock data used when no real data is returned (demo mode)
const MOCK_PORTAL: PortalData = {
  client_name: 'Sarah & Michael',
  property_address: '4821 Maple Creek Dr',
  price: 485000,
  current_stage: 'Under Contract',
  agent_name: 'Jason Rodriguez',
  agent_initials: 'JR',
  agent_phone: '+15551234567',
  agent_email: 'jason@example.com',
  stages: [
    { label: 'Offer Submitted', date: 'Mar 12, 2026', responsible: 'Jason (Agent)', status: 'done' },
    { label: 'Offer Accepted', date: 'Mar 14, 2026', responsible: "Seller's Agent", status: 'done' },
    { label: 'Earnest Money Deposited', date: 'Mar 16, 2026', responsible: 'Title Company', status: 'done', note: '$8,500 deposited to First American Title' },
    { label: 'Home Inspection', date: 'Mar 22, 2026', responsible: 'Buyer', status: 'done' },
    { label: 'Appraisal Ordered', date: 'Mar 25, 2026', responsible: 'Lender', status: 'active', note: 'Appraisal scheduled for Mar 28' },
    { label: 'Financing Approval', date: 'Apr 2, 2026', responsible: 'Lender', status: 'pending' },
    { label: 'Final Walkthrough', date: 'Apr 8, 2026', responsible: 'Buyer & Agent', status: 'pending' },
    { label: 'Closing', date: 'Apr 10, 2026', responsible: 'All Parties', status: 'pending' },
  ],
  updated_at: new Date().toISOString(),
};

function StatusIcon({ status, index }: { status: StageStatus; index: number }) {
  if (status === 'done') {
    return (
      <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500 shrink-0">
        <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500/20 border-2 border-indigo-500 shrink-0 ring-4 ring-indigo-500/20">
        <Circle className="w-3 h-3 text-indigo-400 fill-indigo-400" />
      </div>
    );
  }
  return (
    <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0" style={{ backgroundColor: '#334155', borderWidth: 2, borderColor: '#475569' }}>
      <span className="text-[10px] font-semibold" style={{ color: '#94A3B8' }}>{index + 1}</span>
    </div>
  );
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return; }

    async function loadPortal() {
      try {
        // Look up the share token
        const { data: tokenRow, error: tokenErr } = await supabase
          .from('report_share_tokens')
          .select('*')
          .eq('token_hash', token)
          .maybeSingle();

        if (tokenErr || !tokenRow) {
          // Use mock data for demo/preview
          setData(MOCK_PORTAL);
          setLoading(false);
          return;
        }

        // Check expiry
        if (new Date(tokenRow.expires_at) < new Date()) {
          setError('This link has expired. Please ask your agent for a new one.');
          setLoading(false);
          return;
        }

        if (tokenRow.revoked_at) {
          setError('This link is no longer active.');
          setLoading(false);
          return;
        }

        // Mark as used
        await supabase.from('report_share_tokens').update({ used_at: new Date().toISOString() } as any).eq('id', tokenRow.id);

        // For now, show mock data (real data fetching would use deal_id from tokenRow)
        setData(MOCK_PORTAL);
      } catch {
        setData(MOCK_PORTAL);
      } finally {
        setLoading(false);
      }
    }

    loadPortal();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F172A' }}>
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#0F172A' }}>
        <div className="text-center max-w-sm">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-indigo-400" />
          <p className="text-base font-semibold mb-1" style={{ color: '#E2E8F0' }}>Link Unavailable</p>
          <p className="text-sm" style={{ color: '#94A3B8' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const doneCount = data.stages.filter(s => s.status === 'done').length;

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: '#0F172A' }}>
      <div className="max-w-md mx-auto space-y-4">

        {/* Greeting */}
        <div className="text-center mb-2">
          <p className="text-lg font-bold" style={{ color: '#E2E8F0' }}>
            Hey {data.client_name} 👋
          </p>
          <p className="text-[13px] mt-0.5" style={{ color: '#94A3B8' }}>
            Here's the latest on your deal
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#1E293B' }}>

          {/* Header */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
            <h3 className="text-sm font-semibold tracking-[-0.02em]" style={{ color: '#E2E8F0' }}>
              Deal Progress
            </h3>
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              {doneCount} of {data.stages.length} complete
            </span>
          </div>

          {/* Property Card */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ backgroundColor: '#0F172A' }}>
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/15 shrink-0">
              <Home className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: '#E2E8F0' }}>
                {data.property_address}
              </p>
              <p className="text-[12px] font-medium" style={{ color: '#94A3B8' }}>
                ${data.price.toLocaleString()}
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              {data.current_stage}
            </span>
          </div>

          {/* Agent Card */}
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ backgroundColor: '#0F172A' }}>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
              <span className="text-sm font-bold text-white">{data.agent_initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: '#E2E8F0' }}>{data.agent_name}</p>
              <p className="text-[11px]" style={{ color: '#64748B' }}>Your agent</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {data.agent_phone && (
                <a href={`tel:${data.agent_phone}`} className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 transition-colors">
                  <Phone className="w-4 h-4 text-indigo-400" />
                </a>
              )}
              {data.agent_email && (
                <a href={`mailto:${data.agent_email}`} className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 transition-colors">
                  <Mail className="w-4 h-4 text-indigo-400" />
                </a>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="relative">
            {data.stages.map((stage, i) => {
              const isLast = i === data.stages.length - 1;
              return (
                <motion.div
                  key={stage.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="relative flex gap-3.5"
                >
                  <div className="flex flex-col items-center">
                    <StatusIcon status={stage.status} index={i} />
                    {!isLast && (
                      <div
                        className={cn(
                          'w-px flex-1 min-h-[24px]',
                          stage.status === 'done' && data.stages[i + 1]?.status === 'done'
                            ? 'bg-emerald-500/40'
                            : stage.status === 'done' && data.stages[i + 1]?.status === 'active'
                            ? 'bg-gradient-to-b from-emerald-500/40 to-indigo-500/40'
                            : stage.status === 'active'
                            ? 'bg-gradient-to-b from-indigo-500/40 to-[#334155]'
                            : 'bg-[#334155]'
                        )}
                      />
                    )}
                  </div>

                  <div className={cn('pb-5', isLast && 'pb-0', 'flex-1 min-w-0')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'text-[13px] font-medium leading-tight',
                          stage.status === 'done' && 'text-emerald-300/90',
                          stage.status === 'active' && 'text-white',
                          stage.status === 'pending' && 'text-[#94A3B8]'
                        )}
                      >
                        {stage.label}
                      </span>
                      {stage.date && (
                        <span className="text-[11px] text-[#64748B] whitespace-nowrap shrink-0 tabular-nums">
                          {stage.date}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>
                      <Clock className="inline w-3 h-3 mr-1 -mt-px" />
                      {stage.responsible}
                    </p>
                    {stage.note && (
                      <div
                        className="mt-2 text-[11px] leading-relaxed px-3 py-2 rounded-lg border-l-2"
                        style={{
                          backgroundColor: 'rgba(79, 70, 229, 0.08)',
                          borderColor: stage.status === 'active' ? '#4F46E5' : '#334155',
                          color: stage.status === 'active' ? '#C7D2FE' : '#94A3B8',
                        }}
                      >
                        {stage.note}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t flex items-center justify-center gap-1.5 text-[10px]" style={{ borderColor: '#334155', color: '#64748B' }}>
            <span>Updated {new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>·</span>
            <span className="font-medium" style={{ color: '#818CF8' }}>Powered by Deal Pilot</span>
          </div>
        </div>
      </div>
    </div>
  );
}
