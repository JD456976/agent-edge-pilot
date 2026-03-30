import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Target, DollarSign, Calendar, X, Users, Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Deal, DealStage, RiskLevel, DealParticipant } from '@/types';
import { PARTICIPANT_ROLE_LABELS } from '@/types';
import { ImportSourceBadge } from '@/components/ImportSourceBadge';
import { FubSyncBadge } from '@/components/FubSyncBadge';
import { DealCommissionEditor, type DealCommissionState, type ParticipantEdit } from '@/components/DealCommissionEditor';
import { CommissionDebugPanel } from '@/components/CommissionDebugPanel';
import { LogTouchModal } from '@/components/LogTouchModal';
import { ActivityTrail } from '@/components/ActivityTrail';
import { resolvePersonalCommission } from '@/lib/commissionResolver';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STAGES: { key: DealStage; label: string }[] = [
  { key: 'offer', label: 'Offer' },
  { key: 'offer_accepted', label: 'Accepted' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
];

const riskVariant: Record<RiskLevel, 'urgent' | 'warning' | 'opportunity'> = {
  red: 'urgent', yellow: 'warning', green: 'opportunity',
};

function formatCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
  onProbabilityChange: (dealId: string, value: number) => void;
}

function DealCard({ deal, onClick, onProbabilityChange }: DealCardProps) {
  const userComm = deal.userCommission ?? (() => {
    if (import.meta.env.DEV) {
      console.warn(`[DealCard] userCommission missing for deal "${deal.id}", falling back to $0`);
    }
    return 0;
  })();
  const totalComm = deal.commission;
  const prob = deal.closeProbability ?? 70;

  return (
    <button onClick={onClick} className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors space-y-2">
      <p className="text-sm font-semibold leading-tight">{deal.title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DollarSign className="h-3 w-3" />
        <span>${deal.price.toLocaleString()}</span>
        <span className="text-opportunity font-medium">{formatCurrency(userComm)} your comm.</span>
      </div>
      {userComm !== totalComm && (
        <div className="text-[10px] text-muted-foreground">
          Total: {formatCurrency(totalComm)}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
        <div className="flex items-center gap-1.5">
          {deal.importedFrom?.startsWith('fub:') && <FubSyncBadge entityId={deal.id} />}
          {deal.importedFrom && <ImportSourceBadge importedFrom={deal.importedFrom} compact />}
          <Badge variant={riskVariant[deal.riskLevel]} className="text-[10px] px-1.5 py-0">
            {deal.riskLevel === 'red' ? 'Risk' : deal.riskLevel === 'yellow' ? 'Watch' : 'Good'}
          </Badge>
        </div>
      </div>
      {/* Close probability inline */}
      <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Close prob.</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={prob}
          onChange={e => onProbabilityChange(deal.id, parseInt(e.target.value))}
          className="flex-1 h-1 accent-indigo-500 cursor-pointer"
        />
        <span className={cn(
          'text-[11px] font-semibold tabular-nums w-8 text-right',
          prob >= 70 ? 'text-emerald-400' : prob >= 40 ? 'text-amber-400' : 'text-muted-foreground'
        )}>{prob}%</span>
      </div>
    </button>
  );
}

function ParticipantsList({ participants, deal }: { participants: DealParticipant[]; deal: Deal }) {
  const totalSplit = participants.reduce((sum, p) => sum + (p.splitPercent ?? 0), 0);
  const hasNoParticipantForUser = participants.length === 0;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Users className="h-3.5 w-3.5" /> Participants
      </h3>
      {hasNoParticipantForUser && (
        <p className="text-xs text-muted-foreground mb-2 italic">No personal commission assigned.</p>
      )}
      {totalSplit > 100 && (
        <p className="text-xs text-warning mb-2">⚠ Participant splits exceed 100%.</p>
      )}
      {participants.length > 0 && (
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{p.userName || 'Team Member'}</span>
                <span className="text-xs text-muted-foreground ml-2">{PARTICIPANT_ROLE_LABELS[p.role]}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {p.commissionOverride !== undefined && p.commissionOverride !== null
                  ? <span className="text-opportunity font-medium">{formatCurrency(p.commissionOverride)} override</span>
                  : <span>{p.splitPercent ?? 0}% split</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMeBanner({ deal, userId, onAdd }: { deal: Deal; userId: string; onAdd: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border border-border mt-3">
      <div className="flex-1">
        <p className="text-xs font-medium">Personal commission not configured for you on this deal.</p>
        <p className="text-[10px] text-muted-foreground">Add yourself to track your income from this deal.</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={adding}
        onClick={async () => {
          setAdding(true);
          await onAdd();
          setAdding(false);
        }}
      >
        {adding ? 'Adding…' : 'Add me (100% split)'}
      </Button>
    </div>
  );
}

function DealDetail({ deal, tasks, participants, onClose, onCommissionSave, onAddMeAsParticipant, orgUsers }: {
  deal: Deal;
  tasks: { id: string; title: string; completedAt?: string }[];
  participants: DealParticipant[];
  onClose: () => void;
  onCommissionSave: (dealId: string, state: DealCommissionState, participantEdits: ParticipantEdit[]) => Promise<void>;
  onAddMeAsParticipant: (dealId: string) => Promise<void>;
  orgUsers: { id: string; name: string }[];
}) {
  const { user, logAdminAction } = useAuth();
  const userComm = deal.userCommission ?? deal.commission;
  const hasParticipant = participants.some(p => p.userId === user?.id);
  const [showOutcomeNote, setShowOutcomeNote] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [markingOutcome, setMarkingOutcome] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showTouch, setShowTouch] = useState(false);

  const handleOutcome = async (type: 'closed' | 'cancelled') => {
    setMarkingOutcome(true);
    const field = type === 'closed' ? 'closed_at' : 'cancelled_at';
    await supabase.from('deals').update({
      [field]: new Date().toISOString(),
      outcome_note: outcomeNote || null,
    } as any).eq('id', deal.id);
    await logAdminAction(`deal_${type}`, { dealId: deal.id });
    toast({ description: `Deal marked as ${type}.` });
    setMarkingOutcome(false);
    onClose();
  };

  // ESC key support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-2xl md:rounded-2xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{deal.title}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close deal details"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium">${deal.price.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Commission</span><span className="font-medium">${deal.commission.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Your Commission</span><span className="font-medium text-opportunity">${userComm.toLocaleString()}</span></div>
          {deal.referralFeePercent ? (
            <div className="flex justify-between"><span className="text-muted-foreground">Referral Fee</span><span>{deal.referralFeePercent}%</span></div>
          ) : null}
          <div className="flex justify-between"><span className="text-muted-foreground">Close Date</span><span>{new Date(deal.closeDate).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Risk</span><Badge variant={riskVariant[deal.riskLevel]}>{deal.riskLevel}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stage</span><span className="capitalize">{deal.stage.replace('_', ' ')}</span></div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Close Probability</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={deal.closeProbability ?? 70}
                onChange={async (e) => {
                  const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                  await supabase.from('deals').update({ close_probability: val } as any).eq('id', deal.id);
                }}
                className="w-14 text-right text-sm font-medium bg-transparent border border-border rounded px-1.5 py-0.5 focus:outline-none focus:border-primary"
              />
              <span className="text-muted-foreground text-xs">%</span>
            </div>
          </div>
          {deal.importedFrom && (
            <div className="pt-2">
              <ImportSourceBadge importedFrom={deal.importedFrom} importedAt={deal.importedAt} importRunId={deal.importRunId} />
            </div>
          )}
        </div>

        {/* Outcome Buttons */}
        {deal.stage !== 'closed' && (
          <div className="mt-4 pt-3 border-t border-border space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleOutcome('closed')} disabled={markingOutcome}>
                <Check className="h-3 w-3 mr-1" /> Mark Closed
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs text-muted-foreground" onClick={() => handleOutcome('cancelled')} disabled={markingOutcome}>
                Mark Cancelled
              </Button>
            </div>
            <button onClick={() => setShowOutcomeNote(!showOutcomeNote)} className="text-[10px] text-muted-foreground hover:text-foreground">
              {showOutcomeNote ? 'Hide note' : 'Add note (optional)'}
            </button>
            {showOutcomeNote && (
              <textarea
                value={outcomeNote}
                onChange={e => setOutcomeNote(e.target.value)}
                placeholder="Outcome note…"
                className="w-full text-xs rounded-md border border-border bg-background p-2 resize-none h-16"
              />
            )}
          </div>
        )}

        {/* Add Me Banner */}
        {!hasParticipant && user?.id && (
          <AddMeBanner deal={deal} userId={user.id} onAdd={() => onAddMeAsParticipant(deal.id)} />
        )}

        {/* Commission Editor */}
        <DealCommissionEditor
          deal={deal}
          participants={participants}
          currentUserId={user?.id || ''}
          orgUsers={orgUsers}
          onSave={(state, participantEdits) => onCommissionSave(deal.id, state, participantEdits)}
        />

        {/* Debug Panel (dev only) */}
        <CommissionDebugPanel
          resolution={resolvePersonalCommission(deal, participants, user?.id || '')}
        />

        {/* Log Touch */}
        <div className="mt-3 pt-3 border-t border-border">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowTouch(true)}>
            <Phone className="h-3 w-3 mr-1" /> Log Touch
          </Button>
        </div>

        {/* Activity Trail */}
        <ActivityTrail entityType="deal" entityId={deal.id} refreshKey={activityRefreshKey} />

        {tasks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-2">Related Tasks</h3>
            <div className="space-y-1.5">
              {tasks.map(t => (
                <div key={t.id} className={cn("text-sm py-1", t.completedAt && "line-through text-muted-foreground")}>{t.title}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <LogTouchModal
        open={showTouch}
        onClose={() => setShowTouch(false)}
        entityType="deal"
        entityId={deal.id}
        entityTitle={deal.title}
        onTouchLogged={() => setActivityRefreshKey(k => k + 1)}
      />
    </div>
  );
}

export default function Pipeline() {
  const { user } = useAuth();
  const { deals, tasks, dealParticipants, hasData, seedDemoData, refreshData, updateDealParticipant, addDealParticipant, deleteDealParticipant } = useData();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('user_id, name').eq('is_deleted', false);
      if (data) setOrgUsers(data.map(p => ({ id: p.user_id, name: p.name })));
    })();
  }, []);

  const handleProbabilityChange = useCallback(async (dealId: string, value: number) => {
    await supabase.from('deals').update({ close_probability: value } as any).eq('id', dealId);
    refreshData();
  }, [refreshData]);

  const handleCommissionSave = async (dealId: string, state: DealCommissionState, participantEdits: ParticipantEdit[]) => {
    // Update deal-level commission fields
    const commissionAmount = state.commissionType === 'percentage'
      ? Math.round((deals.find(d => d.id === dealId)?.price ?? 0) * (state.commissionRate / 100))
      : state.commissionType === 'flat' ? state.flatAmount : state.customAmount;

    await supabase.from('deals').update({
      commission_amount: commissionAmount,
      commission_rate: state.commissionType === 'percentage' ? state.commissionRate : null,
      referral_fee_percent: state.referralOutPercent || 0,
      side: state.side,
    } as any).eq('id', dealId);

    // Handle participant edits
    for (const p of participantEdits) {
      if (p.isDeleted && p.id) {
        await deleteDealParticipant(p.id);
      } else if (p.isNew && p.userId) {
        await addDealParticipant({
          dealId,
          userId: p.userId,
          role: p.role,
          splitPercent: p.splitPercent,
          commissionOverride: p.commissionOverride ?? undefined,
        });
      } else if (p.id) {
        await updateDealParticipant({
          id: p.id,
          dealId,
          userId: p.userId,
          userName: p.userName,
          role: p.role,
          splitPercent: p.splitPercent,
          commissionOverride: p.commissionOverride ?? undefined,
        });
      }
    }

    // Ensure current user has a participant entry
    const hasUserEntry = participantEdits.some(p => p.userId === user?.id && !p.isDeleted);
    if (!hasUserEntry && user?.id) {
      await addDealParticipant({
        dealId,
        userId: user.id,
        role: 'primary_agent',
        splitPercent: state.splitPercent,
        commissionOverride: state.flatOverride ?? undefined,
      });
    }

    await refreshData();
    toast({ description: 'Commission details saved.' });
  };

  if (!hasData) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Pipeline</h1>
        <p className="text-sm text-muted-foreground mb-6">Your deals by stage</p>
        <EmptyState title="No deals yet" description="Load demo data to see a realistic pipeline with deals at various stages." actionLabel="Load Demo Data" onAction={seedDemoData} icon={<Target className="h-8 w-8 text-muted-foreground" />} />
      </div>
    );
  }

  const relatedTasks = selectedDeal ? tasks.filter(t => t.relatedDealId === selectedDeal.id) : [];
  const selectedParticipants = selectedDeal ? dealParticipants.filter(p => p.dealId === selectedDeal.id) : [];

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold mb-1">Pipeline</h1>
      <p className="text-sm text-muted-foreground mb-4">Your deals by stage</p>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {STAGES.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage.key);
          return (
            <div key={stage.key} className="min-w-[260px] md:min-w-0 md:flex-1">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{stageDeals.length}</span>
              </div>
              <div className="space-y-2">
                {stageDeals.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg py-8 text-center text-xs text-muted-foreground">No deals</div>
                ) : (
                  stageDeals.map(deal => <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} onProbabilityChange={handleProbabilityChange} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          tasks={relatedTasks}
          participants={selectedParticipants}
          onClose={() => setSelectedDeal(null)}
          onCommissionSave={handleCommissionSave}
          onAddMeAsParticipant={async (dealId: string) => {
            if (!user?.id) return;
            // Load user defaults for split/referral
            const { data: defaults } = await supabase
              .from('commission_defaults')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();
            const splitPct = defaults ? Number((defaults as any).default_split) || 100 : 100;
            await addDealParticipant({
              dealId,
              userId: user.id,
              role: 'primary_agent',
              splitPercent: splitPct,
            });
            toast({ description: 'Added to this deal.' });
          }}
          orgUsers={orgUsers}
        />
      )}
    </div>
  );
}