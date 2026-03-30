import { useState, useCallback } from 'react';
import { Check, Circle, Clock, Home, Phone, Mail, Share2, Copy, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { toast } from '@/hooks/use-toast';

type StageStatus = 'done' | 'active' | 'pending';

interface DealStage {
  label: string;
  date?: string;
  responsible: string;
  status: StageStatus;
  note?: string;
}

const MOCK_STAGES: DealStage[] = [
  { label: 'Offer Submitted', date: 'Mar 12, 2026', responsible: 'Jason (Agent)', status: 'done' },
  { label: 'Offer Accepted', date: 'Mar 14, 2026', responsible: 'Seller\'s Agent', status: 'done' },
  { label: 'Earnest Money Deposited', date: 'Mar 16, 2026', responsible: 'Title Company', status: 'done', note: '$8,500 deposited to First American Title' },
  { label: 'Home Inspection', date: 'Mar 22, 2026', responsible: 'Buyer', status: 'done' },
  { label: 'Appraisal Ordered', date: 'Mar 25, 2026', responsible: 'Lender', status: 'active', note: 'Appraisal scheduled for Mar 28' },
  { label: 'Financing Approval', date: 'Apr 2, 2026', responsible: 'Lender', status: 'pending' },
  { label: 'Final Walkthrough', date: 'Apr 8, 2026', responsible: 'Buyer & Agent', status: 'pending' },
  { label: 'Closing', date: 'Apr 10, 2026', responsible: 'All Parties', status: 'pending' },
];

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
    <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-[#334155] border-2 border-[#475569] shrink-0">
      <span className="text-[10px] font-semibold text-[#94A3B8]">{index + 1}</span>
    </div>
  );
}

export function DealMilestonesPanel() {
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#1E293B' }}>
      {/* Greeting */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-[-0.02em]" style={{ color: '#E2E8F0' }}>
          Hey Sarah,
        </h2>
        <p className="text-[13px] mt-1" style={{ color: '#94A3B8' }}>
          Here's the latest on your home purchase. Everything is moving on schedule.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        <h3 className="text-sm font-semibold tracking-[-0.02em]" style={{ color: '#E2E8F0' }}>
          Deal Progress
        </h3>
        <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
          4 of 8 complete
        </span>
      </div>

      {/* Property Card */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ backgroundColor: '#0F172A' }}>
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/15 shrink-0">
          <Home className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: '#E2E8F0' }}>
            4821 Maple Creek Dr
          </p>
          <p className="text-[12px] font-medium" style={{ color: '#94A3B8' }}>
            $485,000
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          Under Contract
        </span>
      </div>

      {/* Agent Card */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ backgroundColor: '#0F172A' }}>
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
          <span className="text-sm font-bold text-white">JR</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: '#E2E8F0' }}>Jason Rodriguez</p>
          <p className="text-[11px]" style={{ color: '#64748B' }}>Your agent</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <a href="tel:+15551234567" className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 transition-colors">
            <Phone className="w-4 h-4 text-indigo-400" />
          </a>
          <a href="mailto:jason@example.com" className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 transition-colors">
            <Mail className="w-4 h-4 text-indigo-400" />
          </a>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {MOCK_STAGES.map((stage, i) => {
          const isLast = i === MOCK_STAGES.length - 1;
          return (
            <motion.div
              key={stage.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="relative flex gap-3.5"
            >
              {/* Vertical connector line */}
              <div className="flex flex-col items-center">
                <StatusIcon status={stage.status} index={i} />
                {!isLast && (
                  <div
                    className={cn(
                      'w-px flex-1 min-h-[24px]',
                      stage.status === 'done' && MOCK_STAGES[i + 1]?.status === 'done'
                        ? 'bg-emerald-500/40'
                        : stage.status === 'done' && MOCK_STAGES[i + 1]?.status === 'active'
                        ? 'bg-gradient-to-b from-emerald-500/40 to-indigo-500/40'
                        : stage.status === 'active'
                        ? 'bg-gradient-to-b from-indigo-500/40 to-[#334155]'
                        : 'bg-[#334155]'
                    )}
                  />
                )}
              </div>

              {/* Content */}
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

      {/* Share + Footer */}
      <div className="mt-4 pt-3 border-t border-[#334155]">
        <ShareButton />
        <div className="flex items-center justify-center gap-1.5 text-[10px] mt-3" style={{ color: '#64748B' }}>
          <span>Updated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>·</span>
          <span className="font-medium" style={{ color: '#818CF8' }}>Powered by Deal Pilot</span>
        </div>
      </div>
    </div>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    // Generate a demo token for now
    const demoToken = 'demo-' + Math.random().toString(36).slice(2, 10);
    const origin = window.location.hostname === 'localhost'
      ? window.location.origin
      : 'https://deal-pilot-cr.lovable.app';
    const url = `${origin}/portal/${demoToken}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Your Deal Status', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast({ description: 'Portal link copied to clipboard' });
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ description: 'Portal link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  return (
    <button
      onClick={handleShare}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all"
      style={{
        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
        color: '#FFFFFF',
      }}
    >
      {copied ? <CheckCheck className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
      {copied ? 'Link Copied!' : 'Share with Client'}
    </button>
  );
}
