import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal, Lead, Task } from '@/types';
import type { MoneyModelResult } from '@/lib/moneyModel';

export interface PlaybookStep {
  step_order: number;
  action_type: 'call' | 'text' | 'email' | 'schedule_task' | 'log_touch' | 'send_listings' | 'request_docs' | 'status_check';
  timing_bucket: string;
  follow_up_required: boolean;
  recommended_follow_up_timing_bucket: string | null;
  notes_key: string;
}

export interface NetworkPlaybook {
  id: string;
  situationKey: string;
  cohortSize: number;
  steps: PlaybookStep[];
  effectivenessBand: 'low' | 'medium' | 'high';
  confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface SituationMatch {
  situationKey: string;
  entityId: string;
  entityType: 'lead' | 'deal';
  entityTitle: string;
  reason: string;
}

const NOTES_KEY_LABELS: Record<string, string> = {
  initial_outreach: 'Initial outreach',
  follow_up_text: 'Follow-up text',
  schedule_showing: 'Schedule showing',
  status_check: 'Status check',
  document_collection: 'Document collection',
  closing_confirmation: 'Closing confirmation',
  risk_assessment: 'Risk assessment',
  action_plan: 'Action plan',
  milestone_review: 'Milestone review',
  reengagement_call: 'Re-engagement call',
  value_reminder: 'Value reminder',
  gentle_check_in: 'Gentle check-in',
  direct_outreach: 'Direct outreach',
  summary_update: 'Summary update',
  prospecting_block: 'Prospecting block',
  past_client_outreach: 'Past client outreach',
};

export function getStepLabel(notesKey: string): string {
  return NOTES_KEY_LABELS[notesKey] || notesKey.replace(/_/g, ' ');
}

function detectSituations(leads: Lead[], deals: Deal[], tasks: Task[], moneyResults: MoneyModelResult[]): SituationMatch[] {
  const now = new Date();
  const matches: SituationMatch[] = [];

  // untouched_hot_lead_48h
  const hotLeadsNoTouch = leads.filter(l => {
    if (l.leadTemperature !== 'hot') return false;
    const lastContact = new Date(l.lastContactAt);
    return (now.getTime() - lastContact.getTime()) > 48 * 60 * 60 * 1000;
  });
  if (hotLeadsNoTouch.length > 0) {
    const l = hotLeadsNoTouch[0];
    matches.push({
      situationKey: 'untouched_hot_lead_48h',
      entityId: l.id,
      entityType: 'lead',
      entityTitle: l.name,
      reason: `${l.name} is hot but hasn't been contacted in 48+ hours`,
    });
  }

  // closing_3d_open_issues
  const closingSoon = deals.filter(d => {
    if (d.stage === 'closed') return false;
    const closeDate = new Date(d.closeDate);
    const daysUntil = (closeDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntil > 3 || daysUntil < 0) return false;
    const ms = d.milestoneStatus || {};
    return ms.inspection === 'unknown' || ms.financing === 'unknown' || ms.appraisal === 'unknown';
  });
  if (closingSoon.length > 0) {
    const d = closingSoon[0];
    matches.push({
      situationKey: 'closing_3d_open_issues',
      entityId: d.id,
      entityType: 'deal',
      entityTitle: d.title,
      reason: `${d.title} closes in <3 days with unresolved milestones`,
    });
  }

  // high_money_risk_pending
  const highRiskDeals = moneyResults.filter(r => r.riskScore >= 60);
  const pendingHighRisk = highRiskDeals.find(r => {
    const deal = deals.find(d => d.id === r.dealId);
    return deal && deal.stage === 'pending';
  });
  if (pendingHighRisk) {
    const deal = deals.find(d => d.id === pendingHighRisk.dealId);
    if (deal) {
      matches.push({
        situationKey: 'high_money_risk_pending',
        entityId: deal.id,
        entityType: 'deal',
        entityTitle: deal.title,
        reason: `${deal.title} is pending with high money at risk`,
      });
    }
  }

  // lead_decay_spike
  const decayingLeads = leads.filter(l => {
    if (l.leadTemperature === 'hot') return false;
    const lastContact = new Date(l.lastContactAt);
    return (now.getTime() - lastContact.getTime()) > 5 * 24 * 60 * 60 * 1000;
  });
  if (decayingLeads.length >= 3) {
    matches.push({
      situationKey: 'lead_decay_spike',
      entityId: decayingLeads[0].id,
      entityType: 'lead',
      entityTitle: `${decayingLeads.length} leads`,
      reason: `${decayingLeads.length} leads are decaying without contact`,
    });
  }

  // ghost_risk_high
  const ghostRisk = leads.filter(l => {
    const lastContact = new Date(l.lastContactAt);
    return (now.getTime() - lastContact.getTime()) > 7 * 24 * 60 * 60 * 1000 && l.engagementScore < 30;
  });
  if (ghostRisk.length > 0) {
    matches.push({
      situationKey: 'ghost_risk_high',
      entityId: ghostRisk[0].id,
      entityType: 'lead',
      entityTitle: ghostRisk[0].name,
      reason: `${ghostRisk[0].name} shows ghosting risk — no response in 7+ days`,
    });
  }

  return matches.slice(0, 2); // max 2 at a time
}

export function useNetworkPlaybooks(
  leads: Lead[],
  deals: Deal[],
  tasks: Task[],
  moneyResults: MoneyModelResult[],
  showPlaybooks: boolean,
) {
  const { user } = useAuth();
  const [playbooks, setPlaybooks] = useState<NetworkPlaybook[]>([]);
  const [loading, setLoading] = useState(true);

  // Detect current situations
  // Stabilize situations with a JSON key to prevent re-render loops
  const situations = useMemo(
    () => detectSituations(leads, deals, tasks, moneyResults),
    [leads, deals, tasks, moneyResults],
  );

  const situationKeys = useMemo(
    () => situations.map(s => s.situationKey).sort().join(','),
    [situations],
  );

  // Fetch matching playbooks from DB
  useEffect(() => {
    if (!user?.id || !showPlaybooks || situations.length === 0) {
      setPlaybooks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const keys = situationKeys.split(',').filter(Boolean);
    if (keys.length === 0) { setLoading(false); return; }

    (async () => {
      const { data } = await (supabase.from('network_playbooks' as any)
        .select('*')
        .in('situation_key', keys)
        .order('created_at', { ascending: false })
        .limit(6) as any);

      if (cancelled) return;

      if (data && data.length > 0) {
        const seen = new Set<string>();
        const unique: NetworkPlaybook[] = [];
        for (const row of data) {
          if (seen.has(row.situation_key)) continue;
          seen.add(row.situation_key);
          unique.push({
            id: row.id,
            situationKey: row.situation_key,
            cohortSize: row.cohort_size,
            steps: row.playbook_steps as PlaybookStep[],
            effectivenessBand: row.effectiveness_band,
            confidenceBand: row.confidence_band,
          });
        }
        setPlaybooks(unique.slice(0, 2));
      } else {
        setPlaybooks([]);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user?.id, showPlaybooks, situationKeys]);

  return { playbooks, situations, loading };
}
