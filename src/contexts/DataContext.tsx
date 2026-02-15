import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, Deal, Task, Alert, DealParticipant } from '@/types';
import { generateDemoData } from '@/data/demo';
import { resolvePersonalCommission } from '@/lib/commissionResolver';

interface DataContextType {
  leads: Lead[];
  deals: Deal[];
  tasks: Task[];
  alerts: Alert[];
  dealParticipants: DealParticipant[];
  hasData: boolean;
  loading: boolean;
  seedDemoData: () => Promise<void>;
  wipeData: () => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  refreshData: () => Promise<void>;
  updateDealParticipant: (participant: DealParticipant) => Promise<void>;
  addDealParticipant: (participant: Omit<DealParticipant, 'id'>) => Promise<void>;
  deleteDealParticipant: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

function mapLead(row: any): Lead {
  return {
    id: row.id, name: row.name, source: row.source,
    lastContactAt: row.last_contact_at, engagementScore: row.engagement_score,
    notes: row.notes || '', statusTags: row.status_tags || [],
    assignedToUserId: row.assigned_to_user_id || '',
    createdAt: row.created_at, lastActivityAt: row.last_activity_at || undefined,
    leadTemperature: row.lead_temperature || undefined,
    importedFrom: row.imported_from || null,
    importRunId: row.import_run_id || null,
    importedAt: row.imported_at || null,
    lastTouchedAt: row.last_touched_at || undefined,
  };
}

function mapDeal(row: any, userCommission?: number): Deal {
  return {
    id: row.id, title: row.title, stage: row.stage,
    price: Number(row.price), commission: Number(row.commission_amount),
    commissionRate: row.commission_rate ? Number(row.commission_rate) : undefined,
    referralFeePercent: row.referral_fee_percent ? Number(row.referral_fee_percent) : undefined,
    userCommission,
    closeDate: row.close_date, riskLevel: row.risk_level,
    assignedToUserId: row.assigned_to_user_id || '',
    createdAt: row.created_at, lastTouchedAt: row.last_touched_at || undefined,
    riskFlags: row.risk_flags || [],
    milestoneStatus: {
      inspection: row.milestone_inspection || 'unknown',
      financing: row.milestone_financing || 'unknown',
      appraisal: row.milestone_appraisal || 'unknown',
    },
    organizationId: row.organization_id || undefined,
    importedFrom: row.imported_from || null,
    importRunId: row.import_run_id || null,
    importedAt: row.imported_at || null,
  };
}

function mapTask(row: any): Task {
  return {
    id: row.id, title: row.title, type: row.type,
    dueAt: row.due_at, relatedLeadId: row.related_lead_id || undefined,
    relatedDealId: row.related_deal_id || undefined,
    completedAt: row.completed_at || undefined,
    assignedToUserId: row.assigned_to_user_id || '',
    importedFrom: row.imported_from || null,
    importRunId: row.import_run_id || null,
    importedAt: row.imported_at || null,
  };
}

function mapAlert(row: any): Alert {
  return {
    id: row.id, type: row.type, title: row.title,
    detail: row.detail || '', expiresAt: row.expires_at,
    relatedLeadId: row.related_lead_id || undefined,
    relatedDealId: row.related_deal_id || undefined,
  };
}

function mapParticipant(row: any, profileName?: string): DealParticipant {
  return {
    id: row.id, dealId: row.deal_id, userId: row.user_id,
    userName: profileName, role: row.role,
    splitPercent: Number(row.split_percent),
    commissionOverride: row.commission_override ? Number(row.commission_override) : undefined,
  };
}

function buildDealForResolver(dealRow: any): Deal {
  return {
    id: dealRow.id,
    title: dealRow.title,
    stage: dealRow.stage,
    price: Number(dealRow.price),
    commission: Number(dealRow.commission_amount),
    commissionRate: dealRow.commission_rate ? Number(dealRow.commission_rate) : undefined,
    referralFeePercent: dealRow.referral_fee_percent ? Number(dealRow.referral_fee_percent) : undefined,
    closeDate: dealRow.close_date,
    riskLevel: dealRow.risk_level,
    assignedToUserId: dealRow.assigned_to_user_id || '',
    milestoneStatus: {
      inspection: dealRow.milestone_inspection || 'unknown',
      financing: dealRow.milestone_financing || 'unknown',
      appraisal: dealRow.milestone_appraisal || 'unknown',
    },
  };
}

function resolveAndEnrich(dealRow: any, participants: DealParticipant[], userId: string): Partial<Deal> {
  const deal = buildDealForResolver(dealRow);
  const resolution = resolvePersonalCommission(deal, participants, userId);
  return {
    personalCommissionTotal: resolution.personalCommissionTotal,
    personalCommissionConfidence: resolution.confidence,
    personalCommissionWarnings: resolution.warnings,
    personalCommissionDetails: resolution.details as unknown as Record<string, unknown>,
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dealParticipants, setDealParticipants] = useState<DealParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLeads([]); setDeals([]); setTasks([]); setAlerts([]); setDealParticipants([]);
      setLoading(false);
      return;
    }

    const [leadsRes, dealsRes, tasksRes, alertsRes, participantsRes, profilesRes] = await Promise.all([
      supabase.from('leads').select('*'),
      supabase.from('deals').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('alerts').select('*'),
      supabase.from('deal_participants').select('*'),
      supabase.from('profiles').select('user_id, name'),
    ]);

    const profileMap = new Map<string, string>();
    profilesRes.data?.forEach(p => profileMap.set(p.user_id, p.name));

    const mappedParticipants = (participantsRes.data || []).map(r => mapParticipant(r, profileMap.get(r.user_id)));

    const mappedDeals = (dealsRes.data || []).map(r => {
      const enrichment = resolveAndEnrich(r, mappedParticipants, user.id);
      return { ...mapDeal(r, enrichment.personalCommissionTotal), ...enrichment };
    });

    setLeads((leadsRes.data || []).map(mapLead));
    setDeals(mappedDeals);
    setTasks((tasksRes.data || []).map(mapTask));
    setAlerts((alertsRes.data || []).map(mapAlert));
    setDealParticipants(mappedParticipants);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  const seedDemoData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (hasData) {
      const confirmed = window.confirm('Seed demo scenarios alongside real data?');
      if (!confirmed) return;
    }

    const demo = generateDemoData(user.id);

    await supabase.from('leads').insert(demo.leads);
    await supabase.from('deals').insert(demo.deals);
    await supabase.from('deal_participants').insert(demo.dealParticipants);
    await supabase.from('tasks').insert(demo.tasks);
    await supabase.from('alerts').insert(demo.alerts);

    // Log admin action
    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'seed_demo_data',
      metadata: {},
    });

    await loadData();
  };

  const wipeData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dealIds = deals.map(d => d.id);
    if (dealIds.length > 0) {
      await supabase.from('deal_participants').delete().in('deal_id', dealIds);
    }
    await supabase.from('tasks').delete().eq('assigned_to_user_id', user.id);
    const leadIds = leads.map(l => l.id);
    if (leadIds.length > 0) {
      await supabase.from('alerts').delete().in('related_lead_id', leadIds);
    }
    if (dealIds.length > 0) {
      await supabase.from('alerts').delete().in('related_deal_id', dealIds);
    }
    await supabase.from('deals').delete().eq('assigned_to_user_id', user.id);
    await supabase.from('leads').delete().eq('assigned_to_user_id', user.id);

    // Log admin action
    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'wipe_data',
      metadata: {},
    });

    await loadData();
  };

  const completeTask = async (id: string) => {
    await supabase.from('tasks').update({ completed_at: new Date().toISOString() }).eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t));
  };

  const uncompleteTask = async (id: string) => {
    await supabase.from('tasks').update({ completed_at: null }).eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: undefined } : t));
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    const { data } = await supabase.from('tasks').insert({
      title: task.title, type: task.type as any, due_at: task.dueAt,
      related_lead_id: task.relatedLeadId || null,
      related_deal_id: task.relatedDealId || null,
      assigned_to_user_id: task.assignedToUserId,
    }).select().single();
    if (data) setTasks(prev => [...prev, mapTask(data)]);
  };

  const updateDealParticipant = async (p: DealParticipant) => {
    await supabase.from('deal_participants').update({
      role: p.role as any, split_percent: p.splitPercent,
      commission_override: p.commissionOverride ?? null,
    }).eq('id', p.id);
    await loadData();
  };

  const addDealParticipant = async (p: Omit<DealParticipant, 'id'>) => {
    await supabase.from('deal_participants').insert({
      deal_id: p.dealId, user_id: p.userId, role: p.role as any,
      split_percent: p.splitPercent, commission_override: p.commissionOverride ?? null,
    });
    await loadData();
  };

  const deleteDealParticipant = async (id: string) => {
    await supabase.from('deal_participants').delete().eq('id', id);
    await loadData();
  };

  const hasData = leads.length > 0 || deals.length > 0 || tasks.length > 0;

  return (
    <DataContext.Provider value={{
      leads, deals, tasks, alerts, dealParticipants, hasData, loading,
      seedDemoData, wipeData, completeTask, uncompleteTask, addTask,
      refreshData: loadData, updateDealParticipant, addDealParticipant, deleteDealParticipant,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
