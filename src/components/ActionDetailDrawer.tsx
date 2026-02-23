import { useState } from 'react';
import { X, Zap, DollarSign, AlertTriangle, TrendingUp, Eye, Check, Phone, Compass, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogTouchModal } from '@/components/LogTouchModal';
import { ActivityTrail } from '@/components/ActivityTrail';
import { LocalIntelBriefPanel } from '@/components/LocalIntelBriefPanel';
import { ClientPreferencesPanel } from '@/components/ClientPreferencesPanel';
import { useToast } from '@/hooks/use-toast';
import type { ScoredEntity, CommandCenterAction, CommandCenterDealAtRisk, CommandCenterOpportunity, CommandCenterSpeedAlert } from '@/types';

const MC_URL_KEY = 'market_compass_url';
function getMcUrl(): string | null { return localStorage.getItem(MC_URL_KEY); }
function setMcUrlVal(url: string) { localStorage.setItem(MC_URL_KEY, url); }

type DetailItem =
  | { kind: 'action'; data: CommandCenterAction }
  | { kind: 'deal'; data: CommandCenterDealAtRisk }
  | { kind: 'opportunity'; data: CommandCenterOpportunity }
  | { kind: 'speedAlert'; data: CommandCenterSpeedAlert };

interface Props {
  item: DetailItem | null;
  onClose: () => void;
  onComplete?: (taskId: string) => void;
  snoozeCount?: number;
}

function getConfidence(scores: ScoredEntity): 'High' | 'Medium' {
  if ((scores.urgencyScore >= 40 && scores.revenueImpactScore >= 40) || scores.decayRiskScore >= 50) {
    return 'High';
  }
  return 'Medium';
}

function ScoreBar({ label, value, icon: Icon, colorClass }: { label: string; value: number; icon: React.ElementType; colorClass: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-3.5 w-3.5 ${colorClass} shrink-0`} />
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-7 text-right">{value}</span>
    </div>
  );
}

function ScoresSection({ scores, isOpportunity }: { scores: ScoredEntity; isOpportunity?: boolean }) {
  const overallLabel = isOpportunity ? 'Opportunity Heat' : 'Action Urgency';
  const overallValue = isOpportunity ? scores.opportunityScore : scores.overallPriorityScore;

  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Breakdown</h4>
      <ScoreBar label="Urgency" value={scores.urgencyScore} icon={Zap} colorClass="text-urgent" />
      <ScoreBar label="Revenue Impact" value={scores.revenueImpactScore} icon={DollarSign} colorClass="text-opportunity" />
      <ScoreBar label="Decay Risk" value={scores.decayRiskScore} icon={AlertTriangle} colorClass="text-warning" />
      <ScoreBar label={isOpportunity ? '🔥 Heat' : 'Opportunity'} value={scores.opportunityScore} icon={TrendingUp} colorClass="text-opportunity" />
      <ScoreBar label="Attention Gap" value={scores.attentionGapScore} icon={Eye} colorClass="text-time-sensitive" />
      <div className="pt-1 border-t border-border flex items-center justify-between">
        <span className="text-xs font-semibold">{overallLabel}</span>
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${isOpportunity ? 'bg-opportunity' : 'bg-primary'}`} style={{ width: `${overallValue}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{overallValue}</span>
        </div>
      </div>
    </div>
  );
}

function ExplanationList({ explanation }: { explanation: string[] }) {
  if (explanation.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Why This Is Ranked</h4>
      <ul className="space-y-1.5">
        {explanation.map((reason, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="status-dot bg-primary mt-1.5 shrink-0" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActionDetailDrawer({ item, onClose, onComplete, snoozeCount = 0 }: Props) {
  const [showTouch, setShowTouch] = useState(false);
  const [mcSetupOpen, setMcSetupOpen] = useState(false);
  const [mcInputUrl, setMcInputUrl] = useState('');
  const { toast } = useToast();
  if (!item) return null;

  const isOpportunity = item.kind === 'opportunity';
  let title = '';
  let scores: ScoredEntity;
  let subtitle = '';
  let taskId: string | undefined;

  switch (item.kind) {
    case 'action':
      title = item.data.title;
      scores = item.data.scores;
      subtitle = item.data.isSuggested ? 'Suggested Action' : `Score: ${item.data.overallScore}`;
      taskId = item.data.relatedTaskId;
      break;
    case 'deal':
      title = item.data.deal.title;
      scores = item.data.scores;
      subtitle = `$${(item.data.deal.price / 1000).toFixed(0)}K · ${item.data.deal.stage.replace('_', ' ')}`;
      break;
    case 'opportunity':
      title = item.data.lead.name;
      scores = item.data.scores;
      subtitle = `${item.data.lead.source} · 🔥 Heat ${item.data.scores.opportunityScore}`;
      break;
    case 'speedAlert':
      title = item.data.title;
      scores = item.data.scores;
      subtitle = item.data.detail;
      break;
  }

  const confidence = getConfidence(scores!);

  // Determine entity for touch logging
  const touchEntityType: 'lead' | 'deal' | null =
    item.kind === 'deal' ? 'deal' :
    item.kind === 'opportunity' ? 'lead' :
    item.kind === 'action' ? (item.data.relatedDealId ? 'deal' : item.data.relatedLeadId ? 'lead' : null) :
    item.kind === 'speedAlert' ? (item.data.relatedDealId ? 'deal' : item.data.relatedLeadId ? 'lead' : null) : null;
  const touchEntityId =
    item.kind === 'deal' ? item.data.deal.id :
    item.kind === 'opportunity' ? item.data.lead.id :
    item.kind === 'action' ? (item.data.relatedDealId || item.data.relatedLeadId || null) :
    item.kind === 'speedAlert' ? (item.data.relatedDealId || item.data.relatedLeadId || null) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-card border-t md:border-l border-border z-50 flex flex-col max-h-[85vh] md:max-h-full rounded-t-2xl md:rounded-none animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {item.kind === 'action' && item.data.isSuggested && (
            <Badge variant="timeSensitive" className="text-xs">Suggested by Intelligence Engine</Badge>
          )}

          {/* Confidence Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${confidence === 'High' ? 'bg-muted text-foreground/80' : 'bg-muted/50 text-muted-foreground'}`}>
              {confidence}
            </span>
          </div>

          <ScoresSection scores={scores!} isOpportunity={isOpportunity} />

          {/* Low-urgency opportunity note */}
          {isOpportunity && scores!.urgencyScore < 20 && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
              This lead shows strong engagement but may not require immediate action.
            </p>
          )}

          <ExplanationList explanation={scores!.explanation} />

          {snoozeCount >= 3 && (
            <p className="text-xs text-warning italic border-l-2 border-warning/50 pl-3">
              Action repeatedly deferred.
            </p>
          )}

          {/* Intel Brief */}
          {touchEntityType && touchEntityId && (
            <LocalIntelBriefPanel
              entityId={touchEntityId}
              entityType={touchEntityType}
              entityName={title}
              entity={
                item.kind === 'deal' ? item.data.deal :
                item.kind === 'opportunity' ? item.data.lead :
                null as any
              }
            />
          )}

          {/* Client Preferences */}
          {touchEntityType && touchEntityId && (
            <ClientPreferencesPanel
              entityId={touchEntityId}
              entityType={touchEntityType}
              entityName={title}
              entity={
                item.kind === 'deal' ? item.data.deal :
                item.kind === 'opportunity' ? item.data.lead :
                null as any
              }
            />
          )}

          {/* Activity Trail */}
          {touchEntityType && touchEntityId && (
            <ActivityTrail entityType={touchEntityType} entityId={touchEntityId} />
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border space-y-2">
          {touchEntityType === 'lead' && (
            <Button
              size="sm"
              className="w-full gap-2 bg-gradient-to-r from-chart-1 to-chart-2 hover:from-chart-1/90 hover:to-chart-2/90 text-white border-0"
              onClick={() => {
                const base = getMcUrl();
                if (!base) { setMcSetupOpen(true); return; }
                const leadName = item.kind === 'opportunity' ? item.data.lead.name : title;
                const params = new URLSearchParams({ clientName: leadName, source: 'deal-pilot' });
                window.open(`${base.replace(/\/$/, '')}/buyer?${params.toString()}`, '_blank', 'noopener,noreferrer');
                toast({ title: 'Opening Market Compass', description: 'Client data pre-filled.' });
              }}
            >
              <Compass className="h-3.5 w-3.5" />
              Open in Market Compass
            </Button>
          )}
          <div className="flex gap-2">
            {taskId && onComplete && (
              <Button size="sm" variant="default" className="flex-1" onClick={() => { onComplete(taskId!); onClose(); }}>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Mark Done
              </Button>
            )}
            {touchEntityType && touchEntityId && (
              <Button size="sm" variant="outline" onClick={() => setShowTouch(true)}>
                <Phone className="h-3.5 w-3.5 mr-1" />
                Log Touch
              </Button>
            )}
            <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      {touchEntityType && touchEntityId && (
        <LogTouchModal
          open={showTouch}
          onClose={() => setShowTouch(false)}
          entityType={touchEntityType}
          entityId={touchEntityId}
          entityTitle={title}
        />
      )}

      {/* MC Setup Modal */}
      {mcSetupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setMcSetupOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-md mx-4 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10"><Settings className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="text-sm font-bold">Connect Market Compass</h3>
                <p className="text-xs text-muted-foreground">Enter your Market Compass URL to generate client reports.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcUrlDrawer" className="text-xs">Market Compass URL</Label>
              <Input
                id="mcUrlDrawer"
                placeholder="https://your-market-compass.lovable.app"
                value={mcInputUrl}
                onChange={e => setMcInputUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && mcInputUrl.trim()) {
                    let url = mcInputUrl.trim();
                    if (!url.startsWith('http')) url = `https://${url}`;
                    setMcUrlVal(url);
                    setMcSetupOpen(false);
                    const leadName = item?.kind === 'opportunity' ? item.data.lead.name : title;
                    const params = new URLSearchParams({ clientName: leadName, source: 'deal-pilot' });
                    window.open(`${url.replace(/\/$/, '')}/buyer?${params.toString()}`, '_blank');
                    toast({ title: 'Market Compass connected!' });
                  }
                }}
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMcSetupOpen(false)} className="flex-1">Cancel</Button>
              <Button size="sm" disabled={!mcInputUrl.trim()} className="flex-1 gap-1.5" onClick={() => {
                let url = mcInputUrl.trim();
                if (!url.startsWith('http')) url = `https://${url}`;
                setMcUrlVal(url);
                setMcSetupOpen(false);
                const leadName = item?.kind === 'opportunity' ? item.data.lead.name : title;
                const params = new URLSearchParams({ clientName: leadName, source: 'deal-pilot' });
                window.open(`${url.replace(/\/$/, '')}/buyer?${params.toString()}`, '_blank');
                toast({ title: 'Market Compass connected!' });
              }}>
                <Compass className="h-3.5 w-3.5" />
                Connect & Open
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
