import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, AlertTriangle, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Deal, DealParticipant, ParticipantRole } from '@/types';
import { PARTICIPANT_ROLE_LABELS } from '@/types';

export type CommissionType = 'percentage' | 'flat' | 'custom';
export type DealSide = 'buy' | 'sell' | 'dual';

export interface DealCommissionState {
  commissionType: CommissionType;
  commissionRate: number;
  flatAmount: number;
  customAmount: number;
  side: DealSide;
  splitPercent: number;
  referralOutPercent: number;
  referralInPercent: number;
  teamSplitPercent: number;
  flatOverride: number | null;
}

interface Props {
  deal: Deal;
  participants: DealParticipant[];
  currentUserId: string;
  onSave: (state: DealCommissionState, participants: ParticipantEdit[]) => void;
  orgUsers?: { id: string; name: string }[];
}

export interface ParticipantEdit {
  id?: string;
  userId: string;
  userName?: string;
  role: ParticipantRole;
  splitPercent: number;
  commissionOverride: number | null;
  isNew?: boolean;
  isDeleted?: boolean;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString()}`;
}

function computeGross(price: number, state: DealCommissionState): number {
  if (state.commissionType === 'percentage') return Math.round(price * (state.commissionRate / 100));
  if (state.commissionType === 'flat') return state.flatAmount;
  return state.customAmount;
}

function computePersonal(price: number, state: DealCommissionState): number {
  if (state.flatOverride !== null && state.flatOverride > 0) return state.flatOverride;
  const gross = computeGross(price, state);
  const afterReferralOut = gross * (1 - (state.referralOutPercent || 0) / 100);
  const afterReferralIn = afterReferralOut + gross * ((state.referralInPercent || 0) / 100);
  const afterTeam = afterReferralIn * (1 - (state.teamSplitPercent || 0) / 100);
  return Math.max(0, Math.round(afterTeam * (state.splitPercent / 100)));
}

export function DealCommissionEditor({ deal, participants, currentUserId, onSave, orgUsers = [] }: Props) {
  const [state, setState] = useState<DealCommissionState>(() => {
    const userParticipant = participants.find(p => p.userId === currentUserId);
    return {
      commissionType: deal.commissionRate ? 'percentage' : 'flat',
      commissionRate: deal.commissionRate ?? 3,
      flatAmount: deal.commission || 0,
      customAmount: deal.commission || 0,
      side: (deal as any).side || 'buy',
      splitPercent: userParticipant?.splitPercent ?? 100,
      referralOutPercent: deal.referralFeePercent ?? 0,
      referralInPercent: 0,
      teamSplitPercent: 0,
      flatOverride: userParticipant?.commissionOverride ?? null,
    };
  });

  const [complexMode, setComplexMode] = useState(participants.length > 1);
  const [editParticipants, setEditParticipants] = useState<ParticipantEdit[]>(() =>
    participants.map(p => ({
      id: p.id,
      userId: p.userId,
      userName: p.userName,
      role: p.role,
      splitPercent: p.splitPercent,
      commissionOverride: p.commissionOverride ?? null,
    }))
  );
  const [dirty, setDirty] = useState(false);

  const gross = computeGross(deal.price, state);
  const personal = computePersonal(deal.price, state);

  const totalSplit = useMemo(() => {
    if (!complexMode) return state.splitPercent;
    return editParticipants.filter(p => !p.isDeleted).reduce((s, p) => s + p.splitPercent, 0);
  }, [complexMode, editParticipants, state.splitPercent]);

  const splitWarning = totalSplit > 100;

  const update = (patch: Partial<DealCommissionState>) => {
    setState(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const addParticipant = () => {
    setEditParticipants(prev => [...prev, {
      userId: '',
      userName: '',
      role: 'co_agent' as ParticipantRole,
      splitPercent: 0,
      commissionOverride: null,
      isNew: true,
    }]);
    setDirty(true);
  };

  const updateParticipant = (idx: number, patch: Partial<ParticipantEdit>) => {
    setEditParticipants(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
    setDirty(true);
  };

  const removeParticipant = (idx: number) => {
    setEditParticipants(prev => prev.map((p, i) => i === idx ? { ...p, isDeleted: true } : p));
    setDirty(true);
  };

  const availableUsers = orgUsers.filter(u => !editParticipants.some(p => p.userId === u.id && !p.isDeleted));

  return (
    <div className="space-y-4 border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Commission Details</h3>
        {dirty && (
          <Button size="sm" onClick={() => { onSave(state, editParticipants); setDirty(false); }}>
            Save Commission
          </Button>
        )}
      </div>

      {/* Commission Structure */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission Structure</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={state.commissionType} onValueChange={(v: CommissionType) => update({ commissionType: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">% of Price</SelectItem>
                <SelectItem value="flat">Flat Fee</SelectItem>
                <SelectItem value="custom">Custom Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.commissionType === 'percentage' && (
            <div className="space-y-1">
              <Label className="text-xs">Rate (%)</Label>
              <Input type="number" step="0.1" min="0" max="100" className="h-8 text-xs"
                value={state.commissionRate || ''} onChange={e => update({ commissionRate: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
          {state.commissionType === 'flat' && (
            <div className="space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" min="0" className="h-8 text-xs"
                value={state.flatAmount || ''} onChange={e => update({ flatAmount: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
          {state.commissionType === 'custom' && (
            <div className="space-y-1">
              <Label className="text-xs">Custom ($)</Label>
              <Input type="number" min="0" className="h-8 text-xs"
                value={state.customAmount || ''} onChange={e => update({ customAmount: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
        </div>
      </div>

      {/* Side */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Side</Label>
        <Select value={state.side} onValueChange={(v: DealSide) => update({ side: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="buy">Buy Side</SelectItem>
            <SelectItem value="sell">Sell Side</SelectItem>
            <SelectItem value="dual">Dual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Agent Share */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent Share</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">My Split (%)</Label>
            <Input type="number" min="0" max="100" className="h-8 text-xs"
              value={state.splitPercent || ''} onChange={e => update({ splitPercent: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referral Out (%)</Label>
            <Input type="number" min="0" max="100" className="h-8 text-xs"
              value={state.referralOutPercent || ''} onChange={e => update({ referralOutPercent: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referral In (%)</Label>
            <Input type="number" min="0" max="100" className="h-8 text-xs"
              value={state.referralInPercent || ''} onChange={e => update({ referralInPercent: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Team Split (%)</Label>
            <Input type="number" min="0" max="100" className="h-8 text-xs"
              value={state.teamSplitPercent || ''} onChange={e => update({ teamSplitPercent: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flat Override ($)</Label>
          <Input type="number" min="0" className="h-8 text-xs"
            value={state.flatOverride ?? ''} onChange={e => {
              const val = e.target.value ? parseFloat(e.target.value) : null;
              update({ flatOverride: val });
            }} placeholder="Optional — overrides all calculations" />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs border-t border-border pt-2">
        <span className="text-muted-foreground">Gross: {formatCurrency(gross)}</span>
        <span className="font-medium text-foreground">You: {formatCurrency(personal)}</span>
      </div>

      {splitWarning && (
        <div className="flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Total participant splits exceed 100%</span>
        </div>
      )}

      {/* Complex Deal Toggle */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium">Complex Deal</Label>
        </div>
        <Switch checked={complexMode} onCheckedChange={setComplexMode} />
      </div>

      {/* Participants Editor */}
      {complexMode && (
        <div className="space-y-3 pl-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Participants</Label>
          {editParticipants.filter(p => !p.isDeleted).map((p, idx) => {
            const actualIdx = editParticipants.indexOf(p);
            return (
              <div key={actualIdx} className="flex items-start gap-2 p-2.5 rounded-md border border-border bg-muted/20">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {p.isNew ? (
                      <div className="space-y-1">
                        <Label className="text-[10px]">User</Label>
                        <Select value={p.userId} onValueChange={v => {
                          const u = orgUsers.find(ou => ou.id === v);
                          updateParticipant(actualIdx, { userId: v, userName: u?.name });
                        }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select user" /></SelectTrigger>
                          <SelectContent>
                            {availableUsers.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[10px]">User</Label>
                        <p className="text-xs font-medium h-7 flex items-center">{p.userName || 'Team Member'}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-[10px]">Role</Label>
                      <Select value={p.role} onValueChange={(v: ParticipantRole) => updateParticipant(actualIdx, { role: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PARTICIPANT_ROLE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Split (%)</Label>
                      <Input type="number" min="0" max="100" className="h-7 text-xs"
                        value={p.splitPercent || ''} onChange={e => updateParticipant(actualIdx, { splitPercent: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Override ($)</Label>
                      <Input type="number" min="0" className="h-7 text-xs"
                        value={p.commissionOverride ?? ''} onChange={e => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          updateParticipant(actualIdx, { commissionOverride: val });
                        }} placeholder="Optional" />
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 mt-4" onClick={() => removeParticipant(actualIdx)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" className="w-full" onClick={addParticipant}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Participant
          </Button>
        </div>
      )}
    </div>
  );
}
