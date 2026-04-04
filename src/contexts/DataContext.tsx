import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, Deal, Task, Alert, DealParticipant } from '@/types';
import { generateDemoData } from '@/data/demo';
import { generateSeedPack, type SeedPackId } from '@/data/seedPacks';
import { resolvePersonalCommission } from '@/lib/commissionResolver';

interface DataContextType {
  leads: Lead[];
  deals: Deal[];
  tasks: Task[];
  alerts: Alert[];
  dealParticipants: DealParticipant[];
  hasData: boolean;
  hasSeededData: boolean;
  loading: boolean;
  seedDemoData: () => Promise<void>;
  seedPacks: (packIds: SeedPackId[]) => Promise<void>;
  clearSeededData: () => Promise<void>;
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
    snoozeUntil: row.snooze_until || null,
    manualPreferences: row.manual_preferences || null,
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
    side: row.side || 'buy',
    milestoneStatus: {
      inspection: row.milestone_inspection || 'unknown',
      financing: row.milestone_financing || 'unknown',
      appraisal: row.milestone_appraisal || 'unknown',
    },
    organizationId: row.organization_id || undefined,
    importedFrom: row.imported_from || null,
    importRunId: row.import_run_id || null,
    importedAt: row.imported_at || null,
    closeProbability: row.close_probability != null ? Number(row.close_probability) : 70,
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
    closeProbability: dealRow.close_probability != null ? Number(dealRow.close_probability) : 70,
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
  const hasLoadedOnce = useRef(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLeads([]); setDeals([]); setTasks([]); setAlerts([]); setDealParticipants([]);
      setLoading(false);
      return;
    }

    try {
      const [leadsRes, dealsRes, tasksRes, alertsRes, participantsRes, profilesRes] = await Promise.all([
        supabase.from('leads').select('id, name, source, last_contact_at, engagement_score, notes, status_tags, assigned_to_user_id, created_at, last_activity_at, lead_temperature, imported_from, import_run_id, imported_at, last_touched_at, snooze_until').eq('removed_from_fub', false),
        supabase.from('deals').select('id, title, stage, price, commission_amount, commission_rate, referral_fee_percent, close_date, risk_level, assigned_to_user_id, created_at, last_touched_at, risk_flags, side, milestone_inspection, milestone_financing, milestone_appraisal, organization_id, imported_from, import_run_id, imported_at'),
        supabase.from('tasks').select('id, title, type, due_at, related_lead_id, related_deal_id, completed_at, assigned_to_user_id, imported_from, import_run_id, imported_at'),
        supabase.from('alerts').select('id, type, title, detail, expires_at, related_lead_id, related_deal_id'),
        supabase.from('deal_participants').select('*'),
        supabase.from('profiles').select('user_id, name'),
      ]);

      const profileMap = new Map<string, string>();
      (profilesRes.data || []).forEach(p => profileMap.set(p.user_id, p.name));

      const mappedParticipants = (participantsRes.data || []).map(r => mapParticipant(r, profileMap.get(r.user_id)));

      const mappedDeals = (dealsRes.data || []).map(r => {
        try {
          const enrichment = resolveAndEnrich(r, mappedParticipants, user.id);
          return { ...mapDeal(r, enrichment.personalCommissionTotal), ...enrichment };
        } catch {
          // If commission resolution fails for a deal, still show it with defaults
          return mapDeal(r);
        }
      });

      setLeads((leadsRes.data || []).map(mapLead));
      setDeals(mappedDeals);
      setTasks((tasksRes.data || []).map(mapTask));
      setAlerts((alertsRes.data || []).map(mapAlert));
      setDealParticipants(mappedParticipants);
    } catch (err) {
      console.error('Failed to load data:', err);
      // Stale-while-revalidate: keep existing state on transient failure
      // Only show error if we haven't loaded successfully before
      if (!hasLoadedOnce.current) {
        // First load failed — still clear loading so UI isn't stuck
      }
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
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
    if (demo.activityEvents && demo.activityEvents.length > 0) {
      await supabase.from('activity_events').insert(demo.activityEvents);
    }

    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'seed_demo_data',
      metadata: {},
    });

    await loadData();
  };

  const seedPacks = async (packIds: SeedPackId[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { batchId, data: packData } = generateSeedPack(packIds, user.id);

    if (packData.leads.length > 0) await supabase.from('leads').insert(packData.leads);
    if (packData.deals.length > 0) await supabase.from('deals').insert(packData.deals);
    if (packData.dealParticipants.length > 0) await supabase.from('deal_participants').insert(packData.dealParticipants);
    if (packData.tasks.length > 0) await supabase.from('tasks').insert(packData.tasks);
    if (packData.alerts.length > 0) await supabase.from('alerts').insert(packData.alerts);
    if (packData.activityEvents.length > 0) await supabase.from('activity_events').insert(packData.activityEvents);

    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'seed_packs',
      metadata: { packs: packIds, batchId },
    });

    await loadData();
  };

  const clearSeededData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Delete seeded deal_participants first (FK)
    const { data: seededDeals } = await (supabase.from('deals').select('id') as any).eq('seeded', true);
    const seededDealIds = (seededDeals || []).map(d => d.id);
    if (seededDealIds.length > 0) {
      await supabase.from('deal_participants').delete().in('deal_id', seededDealIds);
    }

    // Delete seeded alerts referencing seeded leads/deals
    await (supabase.from('alerts').delete() as any).eq('seeded', true);
    await (supabase.from('tasks').delete() as any).eq('seeded', true);
    await (supabase.from('deals').delete() as any).eq('seeded', true);
    await (supabase.from('leads').delete() as any).eq('seeded', true);
    await supabase.from('activity_events').delete().eq('user_id', user.id);

    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'clear_seeded_data',
      metadata: {},
    });

    await loadData();
  };

  const wipeData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Clean up tables without FK constraints first
    await supabase.from('activity_events').delete().eq('user_id', user.id);
    await supabase.from('ai_follow_up_drafts').delete().eq('user_id', user.id);
    await supabase.from('fub_activity_log').delete().eq('user_id', user.id);
    await supabase.from('fub_appointments').delete().eq('user_id', user.id);
    await supabase.from('fub_push_log').delete().eq('user_id', user.id);
    await supabase.from('fub_watchlist').delete().eq('user_id', user.id);
    await supabase.from('fub_ignored_changes').delete().eq('user_id', user.id);
    await supabase.from('fub_conflict_resolutions').delete().eq('user_id', user.id);
    await supabase.from('fub_sync_state').delete().eq('user_id', user.id);
    await supabase.from('self_opt_action_outcomes').delete().eq('user_id', user.id);
    await supabase.from('self_opt_behavior_signals').delete().eq('user_id', user.id);
    await supabase.from('self_opt_preferences').delete().eq('user_id', user.id);
    await supabase.from('network_telemetry_events').delete().eq('user_id', user.id);
    await supabase.from('network_participation').delete().eq('user_id', user.id);
    // NOTE: crm_integrations is intentionally NOT wiped here.
    // The FUB API key (encrypted separately) also survives wipe,
    // so we keep the integration row to avoid forcing manual reconnection.
    // To fully disconnect FUB, use the Disconnect button in the Sync page.
    await supabase.from('import_dedup_rules').delete().eq('user_id', user.id);
    await supabase.from('intel_briefs').delete().eq('user_id', user.id);

    // FUB staged data (child tables first due to FK)
    const { data: importRuns } = await supabase.from('fub_import_runs').select('id').eq('user_id', user.id);
    if (importRuns && importRuns.length > 0) {
      const runIds = importRuns.map(r => r.id);
      await supabase.from('fub_staged_leads').delete().in('import_run_id', runIds);
      await supabase.from('fub_staged_deals').delete().in('import_run_id', runIds);
      await supabase.from('fub_staged_tasks').delete().in('import_run_id', runIds);
      await supabase.from('fub_import_runs').delete().eq('user_id', user.id);
    }

    // FUB sync/webhook data missed previously
    await supabase.from('fub_webhook_events').delete().eq('user_id', user.id);

    // Deal participants before deals
    const dealIds = deals.map(d => d.id);
    if (dealIds.length > 0) {
      await supabase.from('deal_participants').delete().in('deal_id', dealIds);
    }

    // Tasks (including seeded)
    await supabase.from('tasks').delete().eq('assigned_to_user_id', user.id);
    await (supabase.from('tasks').delete() as any).eq('seeded', true);

    // Alerts referencing leads/deals (and seeded)
    const leadIds = leads.map(l => l.id);
    if (leadIds.length > 0) {
      await supabase.from('alerts').delete().in('related_lead_id', leadIds);
    }
    if (dealIds.length > 0) {
      await supabase.from('alerts').delete().in('related_deal_id', dealIds);
    }
    await (supabase.from('alerts').delete() as any).eq('seeded', true);

    // Now safe to delete deals and leads (include seeded data)
    await supabase.from('deals').delete().eq('assigned_to_user_id', user.id);
    await (supabase.from('deals').delete() as any).eq('seeded', true);
    await supabase.from('leads').delete().eq('assigned_to_user_id', user.id);
    await (supabase.from('leads').delete() as any).eq('seeded', true);

    // Clean admin audit events for this user
    await supabase.from('admin_audit_events' as any).delete().eq('admin_user_id', user.id);

    await supabase.from('admin_audit_events' as any).insert({
      admin_user_id: user.id,
      action: 'wipe_data',
      metadata: {},
    });

    // Clear all dp-* localStorage keys so cached state doesn't persist
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dp-')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    await loadData();
  };

  const completeTask = async (id: string) => {
    const completedAt = new Date().toISOString();
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt } : t));
    const { error } = await supabase.from('tasks').update({ completed_at: completedAt }).eq('id', id);
    if (error) {
      // Rollback on failure
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: undefined } : t));
      console.error('Failed to complete task:', error);
    } else {
      // Auto-push completion to FUB (non-blocking)
      const task = tasks.find(t => t.id === id);
      if (task?.relatedLeadId || task?.relatedDealId) {
        const entityId = task.relatedLeadId || task.relatedDealId;
        const entityTable = task.relatedLeadId ? 'leads' : 'deals';
        supabase.from(entityTable).select('imported_from').eq('id', entityId!).maybeSingle().then(({ data: entity }) => {
          if ((entity as any)?.imported_from?.startsWith('fub:')) {
            import('@/lib/edgeClient').then(({ callEdgeFunction }) => {
              callEdgeFunction('fub-push', {
                entity_type: 'note',
                entity_id: entityId,
                action: 'create',
                fields: {
                  fub_person_id: parseInt((entity as any).imported_from.replace('fub:', '')),
                  body: `Task completed: ${task.title}`,
                  subject: 'Deal Pilot: Task Completed',
                },
              }).catch(() => {});
            });
          }
        });
      }
    }
  };

  const uncompleteTask = async (id: string) => {
    const prev = tasks.find(t => t.id === id);
    // Optimistic update
    setTasks(ts => ts.map(t => t.id === id ? { ...t, completedAt: undefined } : t));
    const { error } = await supabase.from('tasks').update({ completed_at: null }).eq('id', id);
    if (error) {
      // Rollback
      setTasks(ts => ts.map(t => t.id === id ? { ...t, completedAt: prev?.completedAt } : t));
      console.error('Failed to uncomplete task:', error);
    }
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    const { data, error } = await supabase.from('tasks').insert({
      title: task.title, type: task.type as any, due_at: task.dueAt,
      related_lead_id: task.relatedLeadId || null,
      related_deal_id: task.relatedDealId || null,
      assigned_to_user_id: task.assignedToUserId,
      ...(task.completedAt ? { completed_at: task.completedAt } : {}),
    }).select().single();
    if (error) {
      console.error('Failed to add task:', error);
      return;
    }
    if (data) {
      setTasks(prev => [...prev, mapTask(data)]);

      // Auto-push task to FUB (best-effort, non-blocking)
      const relatedLeadId = task.relatedLeadId;
      const relatedDealId = task.relatedDealId;
      if (relatedLeadId || relatedDealId) {
        const entityId = relatedLeadId || relatedDealId;
        const entityTable = relatedLeadId ? 'leads' : 'deals';
        supabase.from(entityTable).select('imported_from').eq('id', entityId!).maybeSingle().then(({ data: entity }) => {
          const importedFrom = (entity as any)?.imported_from;
          if (importedFrom?.startsWith('fub:')) {
            import('@/lib/edgeClient').then(({ callEdgeFunction }) => {
              callEdgeFunction('fub-push', {
                entity_type: 'task',
                entity_id: data.id,
                action: 'create',
                fields: {},
              }).catch(err => {
                if (import.meta.env.DEV) console.warn('FUB task push failed (non-blocking):', err);
              });
            });
          }
        });
      }
    }
  };

  const updateDealParticipant = async (p: DealParticipant) => {
    await supabase.from('deal_participants').update({
      role: p.role as any, split_percent: p.splitPercent,
      commission_override: p.commissionOverride ?? null,
    }).eq('id', p.id);
    setDealParticipants(prev =>
      prev.map(existing =>
        existing.id === p.id
          ? { ...existing, role: p.role, splitPercent: p.splitPercent, commissionOverride: p.commissionOverride }
          : existing
      )
    );
  };

  const addDealParticipant = async (p: Omit<DealParticipant, 'id'>) => {
    await supabase.from('deal_participants').insert({
      deal_id: p.dealId, user_id: p.userId, role: p.role as any,
      split_percent: p.splitPercent, commission_override: p.commissionOverride ?? null,
    });
    const { data: newRow } = await supabase
      .from('deal_participants')
      .select('*')
      .eq('deal_id', p.dealId)
      .eq('user_id', p.userId)
      .maybeSingle();
    if (newRow) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', p.userId)
        .maybeSingle();
      setDealParticipants(prev => [...prev, mapParticipant(newRow, profile?.name)]);
    }
  };

  const deleteDealParticipant = async (id: string) => {
    await supabase.from('deal_participants').delete().eq('id', id);
    setDealParticipants(prev => prev.filter(existing => existing.id !== id));
  };

  const hasData = leads.length > 0 || deals.length > 0 || tasks.length > 0;
  const hasSeededData = deals.some((d: any) => d.seeded) || leads.some((l: any) => l.seeded) || tasks.some((t: any) => t.seeded);

  return (
    <DataContext.Provider value={{
      leads, deals, tasks, alerts, dealParticipants, hasData, hasSeededData, loading,
      seedDemoData, seedPacks, clearSeededData, wipeData, completeTask, uncompleteTask, addTask,
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
