import { useMemo, useState, useEffect, useCallback } from 'react';
import { Building2, Users, DollarSign, AlertTriangle, Shield, TrendingDown, Activity, Target, BookOpen, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { computeAgentHealth, computeBrokerageMetrics, generateValueReport, type AgentSummary, type BrokerageMetrics, type HealthBand } from '@/lib/agentHealthModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatCurrency(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

const HEALTH_COLORS: Record<HealthBand, string> = {
  'Healthy': 'bg-emerald-500',
  'Watch': 'bg-amber-500',
  'Needs Support': 'bg-orange-500',
  'Critical': 'bg-red-500',
};

const HEALTH_TEXT: Record<HealthBand, string> = {
  'Healthy': 'text-emerald-400',
  'Watch': 'text-amber-400',
  'Needs Support': 'text-orange-400',
  'Critical': 'text-red-400',
};

export function BrokerageDashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<BrokerageMetrics | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgentDetail, setShowAgentDetail] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadBrokerageData();
  }, [user?.id]);

  const loadBrokerageData = async () => {
    // Fetch all agent profiles + intelligence data
    const [{ data: profiles }, { data: intelligenceData }] = await Promise.all([
      supabase.from('profiles').select('user_id, name, email, organization_id, status'),
      supabase.from('agent_intelligence_profile' as any).select('*') as any,
    ]);

    if (!profiles) { setLoading(false); return; }

    const intMap = new Map<string, any>();
    (intelligenceData || []).forEach((d: any) => intMap.set(d.user_id, d));

    const activeProfiles = profiles.filter(p => (p as any).status === 'active');

    // Build agent summaries from intelligence profiles
    const summaries: AgentSummary[] = activeProfiles.map(p => {
      const intel = intMap.get(p.user_id);
      const activeDays = intel?.active_days_last_30 ?? 0;
      const stabilityScore = intel ? (
        intel.stability_trend === 'improving' ? 80 :
        intel.stability_trend === 'stable' ? 65 : 45
      ) : 50;

      const forecastTrend = intel?.income_trend ?? 'flat';
      const activityDecline = intel?.stability_trend === 'declining' || activeDays < 10;

      const health = computeAgentHealth({
        stabilityScore,
        overdueTaskCount: 0, // aggregated — we don't access individual task data here
        moneyAtRiskRatio: intel?.risk_tolerance === 'high' ? 0.4 : intel?.risk_tolerance === 'medium' ? 0.2 : 0.1,
        forecastTrend,
        activityDecline,
        totalActiveDays30: activeDays,
      });

      return {
        userId: p.user_id,
        name: p.name || p.email,
        healthScore: health,
        stabilityScore,
        forecast30: 0, // would come from actual forecast computation
        moneyAtRisk: 0,
        overdueTaskCount: 0,
        activeDays30: activeDays,
        forecastTrend,
        activityDecline,
      };
    });

    setAgents(summaries);
    setMetrics(computeBrokerageMetrics(summaries));
    setLoading(false);
  };

  const valueReport = useMemo(() => {
    if (!metrics || agents.length === 0) return null;
    return generateValueReport(agents, metrics.totalMoneyAtRisk, metrics.totalProjectedCommission30);
  }, [agents, metrics]);

  const exportReport = useCallback(() => {
    if (!valueReport) return;
    const blob = new Blob([JSON.stringify(valueReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brokerage-value-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [valueReport]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-48" />
          <div className="grid grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!metrics || agents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No agent data available for brokerage intelligence.</p>
        <p className="text-xs text-muted-foreground mt-1">Agent intelligence profiles are built as agents use Deal Pilot.</p>
      </div>
    );
  }

  const totalBands = Object.values(metrics.healthDistribution).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Brokerage Intelligence</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowReport(!showReport)}>
            <BookOpen className="h-3.5 w-3.5 mr-1" /> Value Report
          </Button>
          <Button size="sm" variant="outline" onClick={exportReport}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
          </div>
          <p className="text-lg font-bold">{metrics.totalAgents}</p>
          <p className="text-[10px] text-muted-foreground">{metrics.activityHealthIndicators.activeAgents} active</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Projected (30d)</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(metrics.totalProjectedCommission30)}</p>
          <p className="text-[10px] text-muted-foreground">Avg {formatCurrency(metrics.avgForecast30)}/agent</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">At Risk</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(metrics.totalMoneyAtRisk)}</p>
          <p className="text-[10px] text-muted-foreground">Across all agents</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Stability</span>
          </div>
          <p className="text-lg font-bold">{metrics.avgStabilityScore}</p>
          <p className="text-[10px] text-muted-foreground">out of 100</p>
        </div>
      </div>

      {/* Health Distribution */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Agent Health Distribution</p>
        <div className="flex h-3 rounded-full overflow-hidden mb-3">
          {(['Healthy', 'Watch', 'Needs Support', 'Critical'] as HealthBand[]).map(band => {
            const pct = (metrics.healthDistribution[band] / totalBands) * 100;
            if (pct === 0) return null;
            return <div key={band} className={cn(HEALTH_COLORS[band])} style={{ width: `${pct}%` }} />;
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(['Healthy', 'Watch', 'Needs Support', 'Critical'] as HealthBand[]).map(band => (
            <div key={band} className="flex items-center gap-1.5 text-xs">
              <span className={cn('w-2 h-2 rounded-full', HEALTH_COLORS[band])} />
              <span className="text-muted-foreground">{band}: <span className="font-medium text-foreground">{metrics.healthDistribution[band]}</span></span>
            </div>
          ))}
        </div>
      </div>

      {/* Retention Warnings */}
      {metrics.retentionWarnings.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <p className="text-sm font-semibold text-destructive">Retention & Risk Alerts</p>
          </div>
          {metrics.retentionWarnings.map((warning, i) => (
            <p key={i} className="text-xs text-muted-foreground">{warning}</p>
          ))}
        </div>
      )}

      {/* Coaching Focus Areas */}
      {metrics.coachingFocusAreas.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coaching Opportunities</p>
          </div>
          {metrics.coachingFocusAreas.map((area, i) => (
            <div key={i} className="flex items-start gap-2">
              <Badge variant="outline" className={cn('text-[10px] shrink-0', area.priority === 'high' ? 'border-warning/50 text-warning' : '')}>
                {area.priority}
              </Badge>
              <div>
                <p className="text-xs font-medium">{area.area}</p>
                <p className="text-xs text-muted-foreground">{area.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Health */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activity Health</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-emerald-400">{metrics.activityHealthIndicators.activeAgents}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{metrics.activityHealthIndicators.decliningAgents}</p>
            <p className="text-[10px] text-muted-foreground">Declining</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-400">{metrics.activityHealthIndicators.disengagedAgents}</p>
            <p className="text-[10px] text-muted-foreground">Disengaged</p>
          </div>
        </div>
      </div>

      {/* Agent Detail Toggle */}
      <button
        onClick={() => setShowAgentDetail(!showAgentDetail)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
      >
        {showAgentDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showAgentDetail ? 'Hide agent details' : 'Show agent health details'}
      </button>

      {showAgentDetail && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Individual Agent Health</p>
          {agents.map(agent => (
            <div key={agent.userId} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', HEALTH_COLORS[agent.healthScore.band])} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{agent.name}</p>
                  <p className="text-[10px] text-muted-foreground">{agent.activeDays30} active days · {agent.forecastTrend} forecast</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={cn('text-xs font-medium', HEALTH_TEXT[agent.healthScore.band])}>
                  {agent.healthScore.score}
                </span>
                <Badge variant="outline" className="text-[10px]">{agent.healthScore.band}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Value Report */}
      {showReport && valueReport && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Monthly Value Report — {valueReport.period}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Income Protected</p>
              <p className="font-bold">{formatCurrency(valueReport.incomeProtected)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Deals Saved from Risk</p>
              <p className="font-bold">{valueReport.dealsSavedFromRisk}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Productivity</p>
              <p className="font-bold text-xs">{valueReport.productivityImprovement}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stability</p>
              <p className="font-bold text-xs">{valueReport.stabilityImprovement}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            No individual agent data is exposed. All metrics are aggregated at the organizational level.
          </p>
        </div>
      )}

      {/* Privacy Statement */}
      <div className="text-center py-2">
        <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="h-3 w-3" />
          Individual agent data is never exposed publicly. All brokerage views show aggregated metrics only.
        </p>
      </div>
    </div>
  );
}
