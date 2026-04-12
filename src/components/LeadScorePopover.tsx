import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Lead } from '@/types';

interface Props {
  lead: Lead;
  score: number;
  allLeads?: Lead[];
  children: ReactNode;
}

function getHeatLabel(score: number): { label: string; emoji: string } {
  if (score >= 75) return { label: 'High — active engagement signals', emoji: '🔥' };
  if (score >= 50) return { label: 'Medium — some engagement', emoji: '☀️' };
  return { label: 'Low — minimal activity', emoji: '❄️' };
}

function getContactLabel(lead: Lead): string {
  if (!lead.lastTouchedAt && !lead.lastContactAt) return 'Never reached';
  const date = lead.lastTouchedAt || lead.lastContactAt;
  const days = Math.floor((Date.now() - new Date(date!).getTime()) / 86400000);
  if (days === 0) return 'Contacted today';
  if (days === 1) return 'Contacted yesterday';
  return `Last contact ${days}d ago`;
}

function getDaysInPipeline(lead: Lead): number {
  return Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
}

function getVerdict(lead: Lead, score: number): string {
  const neverContacted = !lead.lastTouchedAt && !lead.lastContactAt;
  if (score >= 75 && neverContacted) return 'This lead scores high because of strong engagement signals but has never been contacted — immediate outreach recommended.';
  if (score >= 75) return 'Strong engagement signals detected. Keep momentum with consistent follow-ups.';
  if (score >= 50 && neverContacted) return 'Moderate engagement but no contact yet. Reach out soon before interest fades.';
  if (score >= 50) return 'Warming up. One more quality touch could push this lead into hot territory.';
  if (neverContacted) return 'Low engagement and no contact. Qualify this lead before investing more time.';
  return 'Low activity. Consider a re-engagement campaign or archive if unresponsive.';
}

export function LeadScorePopover({ lead, score, children }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(o => !o);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const heat = getHeatLabel(score);
  const contact = getContactLabel(lead);
  const days = getDaysInPipeline(lead);
  const verdict = getVerdict(lead, score);

  return (
    <span className="relative inline-flex">
      <span onClick={toggle} className="cursor-pointer">
        {children}
      </span>
      {open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 rounded-lg border border-border/50 bg-foreground text-background p-3 shadow-xl text-[11px] space-y-2"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[13px] font-bold">Score: {score}/100</p>
          <div className="space-y-1">
            <p>{heat.emoji} Heat: {heat.label}</p>
            <p>📞 Contact: {contact}</p>
            <p>⏱️ Days in pipeline: {days}</p>
            <p>📍 Source: {lead.source || 'Direct'}</p>
          </div>
          <p className="text-[10px] leading-relaxed opacity-80 pt-1 border-t border-white/10">
            {verdict}
          </p>
        </div>
      )}
    </span>
  );
}
