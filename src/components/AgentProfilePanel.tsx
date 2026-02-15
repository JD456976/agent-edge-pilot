import { User, TrendingUp, TrendingDown, Minus, Shield, Phone, MessageSquare, Mail, Info, Download, RotateCcw } from 'lucide-react';
import type { AgentProfile } from '@/hooks/useAgentProfile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface Props {
  profile: AgentProfile;
  loading: boolean;
  onExport: () => void;
  onReset: () => void;
}

const TREND_CONFIG = {
  improving: { icon: TrendingUp, label: 'Improving', className: 'text-emerald-400' },
  stable: { icon: Minus, label: 'Stable', className: 'text-muted-foreground' },
  declining: { icon: TrendingDown, label: 'Declining', className: 'text-amber-400' },
  rising: { icon: TrendingUp, label: 'Rising', className: 'text-emerald-400' },
  flat: { icon: Minus, label: 'Flat', className: 'text-muted-foreground' },
};

function TrendBadge({ trend }: { trend: string }) {
  const config = TREND_CONFIG[trend as keyof typeof TREND_CONFIG];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', config.className)}>
      <Icon className="h-3 w-3" /> {config.label}
    </span>
  );
}

function ChannelBar({ label, icon: Icon, pct }: { label: string; icon: React.ElementType; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground w-12">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

export function AgentProfilePanel({ profile, loading, onExport, onReset }: Props) {
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');

  if (loading) return null;

  const lastUpdated = new Date(profile.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Your Operating Style</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Updated {lastUpdated}</span>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
        <Shield className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <span>Your intelligence profile is private and used only to improve recommendations.</span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground">Active Days (30d)</p>
          <p className="text-lg font-semibold">{profile.activeDaysLast30}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Avg Daily Actions</p>
          <p className="text-lg font-semibold">{profile.avgDailyActions}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Lead Conversion</p>
          <p className="text-lg font-semibold">{Math.round(profile.leadConversionRateEstimate * 100)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Deal Close Rate</p>
          <p className="text-lg font-semibold">{Math.round(profile.dealCloseRateEstimate * 100)}%</p>
        </div>
      </div>

      {/* Trends */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Stability Trend</span>
          <TrendBadge trend={profile.stabilityTrend} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Income Trend</span>
          <TrendBadge trend={profile.incomeTrend} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Risk Tolerance</span>
          <span className={cn('text-xs font-medium capitalize', 
            profile.riskTolerance === 'high' ? 'text-amber-400' :
            profile.riskTolerance === 'low' ? 'text-emerald-400' : 'text-muted-foreground'
          )}>{profile.riskTolerance}</span>
        </div>
      </div>

      {/* Channel Mix */}
      <div className="space-y-2">
        <p className="text-xs font-medium">Channel Preference</p>
        <ChannelBar label="Call" icon={Phone} pct={profile.preferredChannelCallPct} />
        <ChannelBar label="Text" icon={MessageSquare} pct={profile.preferredChannelTextPct} />
        <ChannelBar label="Email" icon={Mail} pct={profile.preferredChannelEmailPct} />
      </div>

      {/* Avg time to close */}
      {profile.avgTimeToCloseBucket && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avg Time to Close</span>
          <span className="font-medium">{profile.avgTimeToCloseBucket.replace(/_/g, ' ')}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="outline" className="text-xs" onClick={onExport}>
          <Download className="h-3 w-3 mr-1" /> Export
        </Button>
        {!showReset ? (
          <Button size="sm" variant="outline" className="text-xs text-destructive border-destructive/30" onClick={() => setShowReset(true)}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Type RESET"
              value={resetConfirm}
              onChange={e => setResetConfirm(e.target.value)}
              className="h-7 w-24 px-2 text-xs rounded border border-border bg-background"
            />
            <Button
              size="sm"
              variant="destructive"
              className="text-xs h-7"
              disabled={resetConfirm !== 'RESET'}
              onClick={() => { onReset(); setShowReset(false); setResetConfirm(''); }}
            >
              Confirm
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
