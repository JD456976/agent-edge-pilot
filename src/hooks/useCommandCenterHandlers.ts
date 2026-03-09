import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { suggestAction, type MoneyModelResult } from '@/lib/moneyModel';
import type { OpportunityHeatResult } from '@/lib/leadMoneyModel';
import type { NetworkPlaybook } from '@/hooks/useNetworkPlaybooks';
import type { Deal, Lead, Task } from '@/types';

interface UseCommandCenterHandlersOpts {
  userId: string | undefined;
  deals: Deal[];
  leads: Lead[];
  tasks: Task[];
  moneyResults: MoneyModelResult[];
  opportunityResults: OpportunityHeatResult[];
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  setExecutionEntity: (entity: any) => void;
  setMoneyDrawerResult: (result: MoneyModelResult | null) => void;
  setMoneyDrawerDeal: (deal: Deal | null) => void;
  setTouchTarget: (target: { entityType: 'lead' | 'deal'; entityId: string; entityTitle: string } | null) => void;
  setShowLogTouch: (show: boolean) => void;
}

export function useCommandCenterHandlers({
  userId, deals, leads, moneyResults, opportunityResults,
  addTask, uncompleteTask,
  setExecutionEntity, setMoneyDrawerResult, setMoneyDrawerDeal,
  setTouchTarget, setShowLogTouch,
}: UseCommandCenterHandlersOpts) {

  const handleMoneySelect = useCallback((result: MoneyModelResult, deal: Deal) => {
    setMoneyDrawerResult(result);
    setMoneyDrawerDeal(deal);
  }, [setMoneyDrawerResult, setMoneyDrawerDeal]);

  const handleOpportunityAction = useCallback(async (lead: Lead, result: OpportunityHeatResult) => {
    const taskType = lead.leadTemperature === 'hot' ? 'call' : 'follow_up';
    const title = lead.leadTemperature === 'hot' ? `Call ${lead.name} — hot lead` : `Follow up with ${lead.name}`;
    await addTask({
      title, type: taskType as any, dueAt: new Date().toISOString(),
      relatedLeadId: lead.id, assignedToUserId: userId || ''
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, userId]);

  const handleOpenLead = useCallback((lead: Lead) => {
    const or = opportunityResults.find((r) => r.leadId === lead.id) || null;
    setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: or });
  }, [opportunityResults, setExecutionEntity]);

  const handleOpenDeal = useCallback((deal: Deal) => {
    const mr = moneyResults.find((r) => r.dealId === deal.id) || null;
    setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: mr });
  }, [moneyResults, setExecutionEntity]);

  const handleOpenExecution = useCallback((entityId: string, entityType: 'deal' | 'lead') => {
    if (entityType === 'deal') {
      const deal = deals.find((d) => d.id === entityId);
      if (!deal) return;
      const mr = moneyResults.find((r) => r.dealId === entityId) || null;
      setExecutionEntity({ entity: deal, entityType: 'deal', moneyResult: mr });
    } else {
      const lead = leads.find((l) => l.id === entityId);
      if (!lead) return;
      const or = opportunityResults.find((r) => r.leadId === entityId) || null;
      setExecutionEntity({ entity: lead, entityType: 'lead', oppResult: or });
    }
  }, [deals, leads, moneyResults, opportunityResults, setExecutionEntity]);

  const handleAutopilotCreateTask = useCallback(async (title: string, dealId?: string, leadId?: string) => {
    await addTask({
      title, type: 'follow_up', dueAt: new Date().toISOString(),
      relatedDealId: dealId, relatedLeadId: leadId, assignedToUserId: userId || ''
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, userId]);

  const handleExecutionFollowUp = useCallback(async (title: string, type: string, dueAt: string, entityId: string, entityType: 'deal' | 'lead') => {
    await addTask({
      title, type: (type || 'follow_up') as any, dueAt,
      relatedDealId: entityType === 'deal' ? entityId : undefined,
      relatedLeadId: entityType === 'lead' ? entityId : undefined,
      assignedToUserId: userId || ''
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, userId]);

  const handleExecutionLogTouch = useCallback((entityType: 'deal' | 'lead', entityId: string, entityTitle: string) => {
    setExecutionEntity(null);
    setTouchTarget({ entityType, entityId, entityTitle });
    setShowLogTouch(true);
  }, [setExecutionEntity, setTouchTarget, setShowLogTouch]);

  const handleForecastCreateTask = useCallback(async (title: string, dealId: string) => {
    await addTask({
      title, type: 'follow_up', dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      relatedDealId: dealId, assignedToUserId: userId || ''
    });
    toast({ description: `Task created: ${title}`, duration: 3000 });
  }, [addTask, userId]);

  const handleStartAction = useCallback(async (deal: Deal, result: MoneyModelResult) => {
    const suggested = suggestAction(result, deal);
    const dueDate = result.riskScore >= 70
      ? new Date().toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await addTask({
      title: suggested.title, type: suggested.type as any, dueAt: dueDate,
      relatedDealId: deal.id, assignedToUserId: userId || ''
    });
    toast({ description: 'Task created from money risk analysis', duration: 3000 });
    setMoneyDrawerResult(null);
    setMoneyDrawerDeal(null);
  }, [addTask, userId, setMoneyDrawerResult, setMoneyDrawerDeal]);

  const handleApplyPlaybook = useCallback(async (playbook: NetworkPlaybook, situation: { entityId: string; entityType: 'lead' | 'deal'; entityTitle: string }) => {
    const timingToMs: Record<string, number> = { now: 0, under_1h: 3600000, same_day: 14400000, next_day: 86400000 };
    for (const step of playbook.steps) {
      const dueAt = new Date(Date.now() + (timingToMs[step.timing_bucket] || 0)).toISOString();
      const actionLabel = step.notes_key.replace(/_/g, ' ');
      await addTask({
        title: `${actionLabel} — ${situation.entityTitle}`,
        type: (step.action_type === 'call' ? 'call' : step.action_type === 'text' ? 'text' : step.action_type === 'email' ? 'email' : 'follow_up') as any,
        dueAt,
        relatedDealId: situation.entityType === 'deal' ? situation.entityId : undefined,
        relatedLeadId: situation.entityType === 'lead' ? situation.entityId : undefined,
        assignedToUserId: userId || ''
      });
    }
    toast({ description: `Playbook applied: ${playbook.steps.length} tasks created`, duration: 3000 });
  }, [addTask, userId]);

  return {
    handleMoneySelect,
    handleOpportunityAction,
    handleOpenLead,
    handleOpenDeal,
    handleOpenExecution,
    handleAutopilotCreateTask,
    handleExecutionFollowUp,
    handleExecutionLogTouch,
    handleForecastCreateTask,
    handleStartAction,
    handleApplyPlaybook,
  };
}
