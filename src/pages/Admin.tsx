import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users, ShieldCheck, Clock, TrendingUp, RefreshCw,
  UserCheck, Database, Sparkles, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, addDays } from 'date-fns';
import { UserManagementPanel } from '@/components/admin/UserManagementPanel';

const OWNER_EMAILS = ['craig219@comcast.net', 'jason.craig@chinattirealty.com', 'jdog45@gmail.com'];
const isAdminEmail = (e?: string | null) => !!e && OWNER_EMAILS.some(a => a.toLowerCase() === e.toLowerCase());

// ── Types ─────────────────────────────────────────────────────────────────────
interface AppUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastActiveAt: string | null;
  isPro: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  source: string | null;
}

interface Metrics {
  total: number;
  activeToday: number;
  activeThisWeek: number;
  proCount: number;
  trialCount: number;
  expiredCount: number;
  topEvents: { type: string; count: number }[];
}

type AccessStatus = 'active' | 'trial' | 'expiring' | 'expired' | 'revoked' | 'none';

function getStatus(u: AppUser): AccessStatus {
  if (u.source === 'admin_revoked') return 'revoked';
  if (u.expiresAt) {
    const exp = new Date(u.expiresAt);
    if (exp < new Date()) return 'expired';
    if (exp.getTime() - Date.now() < 7 * 86400000) return 'expiring';
  }
  if (u.isTrial) return 'trial';
  if (u.isPro || u.status === 'active') return 'active';
  return 'none';
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const DEMO_MARKER = 'dealPilot_demoSeeded';

function DemoTab() {
  const [seeded, setSeeded] = useState(() => !!localStorage.getItem(DEMO_MARKER));
  const { toast } = useToast();

  const seed = () => {
    const now = new Date();
    localStorage.setItem('dealPilot_appointments', JSON.stringify([
      { id: 'demo-a1', leadName: 'Alex Johnson', type: 'Showing', date: format(addDays(now,1),'yyyy-MM-dd'), time: '10:00', address: '4821 Maple Creek Dr', notes: 'Pre-approved, highly motivated' },
      { id: 'demo-a2', leadName: 'Maria Santos', type: 'CMA', date: format(addDays(now,2),'yyyy-MM-dd'), time: '14:00', address: '128 Pine Valley Rd', notes: 'Wants to list end of month' },
      { id: 'demo-a3', leadName: 'David Lee', type: 'Follow-Up Call', date: format(now,'yyyy-MM-dd'), time: '16:30', notes: 'Check pre-approval status' },
    ]));
    localStorage.setItem('dealPilot_activityLog', JSON.stringify([
      { leadId: 'demo-1', leadName: 'Alex Johnson', type: 'call', timestamp: Date.now()-86400000, date: new Date(Date.now()-86400000).toISOString() },
      { leadId: 'demo-2', leadName: 'Maria Santos', type: 'text', timestamp: Date.now()-172800000, date: new Date(Date.now()-172800000).toISOString() },
      { leadId: 'demo-3', leadName: 'David Lee', type: 'email', timestamp: Date.now()-259200000, date: new Date(Date.now()-259200000).toISOString() },
    ]));
    localStorage.setItem('dealPilot_deals', JSON.stringify([
      { id: 'demo-d1', clientName: 'Alex Johnson', propertyAddress: '4821 Maple Creek Dr', salePrice: 485000, contractDate: format(addDays(now,-14),'yyyy-MM-dd'), closingDate: format(addDays(now,16),'yyyy-MM-dd'), agentRole: 'buyer', stages: { inspection: true, financing: false, appraisal: false, walkthrough: false, closing: false }, keyDates: {}, archived: false, createdAt: now.toISOString() },
    ]));
    localStorage.setItem(DEMO_MARKER, 'true');
    setSeeded(true);
    toast({ description: 'Demo data loaded — showing sample leads, appointments and a deal' });
  };

  const wipe = () => {
    ['dealPilot_appointments','dealPilot_activityLog','dealPilot_deals',
     'dealPilot_enrollments','dealPilot_streak','dealPilot_lastActive',
     'dealPilot_messageTemplates', DEMO_MARKER].forEach(k => localStorage.removeItem(k));
    setSeeded(false);
    toast({ description: 'Demo data wiped — sync FUB to load your real pipeline' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Demo Data</h3>
          {seeded && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">Active</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Load a sample pipeline — 5 leads, 3 appointments, and 1 active deal — to explore Deal Pilot before connecting Follow Up Boss.
          When you sync FUB, all demo data is automatically replaced with your real pipeline.
        </p>
        <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Seeded data includes:</p>
          {['5 sample leads (hot, warm, cold)','3 appointments this week','1 deal under contract with milestone tracker','3 activity log entries (call, text, email)'].map(item => (
            <div key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="text-primary">→</span> {item}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          {!seeded ? (
            <Button size="sm" onClick={seed} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />Load Demo Data
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={seed} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />Refresh Demo
              </Button>
              <Button size="sm" variant="outline" onClick={wipe} className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50">
                <Trash2 className="h-3.5 w-3.5" />Wipe Demo Data
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sync Behavior</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          When an agent runs a Follow Up Boss sync, the app automatically detects and removes any demo data before importing their real CRM leads. They never see demo and real data mixed together.
        </p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<'users' | 'metrics' | 'demo'>('users');
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === 'admin' || isAdminEmail(user?.email);

  const loadMetrics = useCallback(async () => {
    setRefreshing(true);
    try {
      const [profilesRes, rolesRes, entRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('user_id,status,last_active_at,created_at').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id,role'),
        supabase.from('user_entitlements' as any).select('user_id,is_pro,is_trial,expires_at,source'),
        supabase.from('activity_events').select('touch_type').limit(1000),
      ]);

      const roleMap = new Map<string,string>();
      rolesRes.data?.forEach((r: any) => roleMap.set(r.user_id, r.role));
      const entMap = new Map<string,any>();
      entRes.data?.forEach((e: any) => entMap.set(e.user_id, e));

      const appUsers: AppUser[] = (profilesRes.data || []).map((p: any) => {
        const ent = entMap.get(p.user_id);
        return {
          userId: p.user_id, name: '', email: '',
          role: roleMap.get(p.user_id) || 'agent',
          status: p.is_deleted ? 'removed' : (p.status || 'active'),
          createdAt: p.created_at, lastActiveAt: p.last_active_at ?? null,
          isPro: ent?.is_pro ?? false, isTrial: ent?.is_trial ?? false,
          expiresAt: ent?.expires_at ?? null, source: ent?.source ?? null,
        };
      });

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() || 7) - 1));

      const eventCounts = new Map<string,number>();
      eventsRes.data?.forEach((e: any) => {
        const t = (e.touch_type || 'unknown').toLowerCase();
        eventCounts.set(t, (eventCounts.get(t) || 0) + 1);
      });

      setMetrics({
        total: appUsers.length,
        activeToday: appUsers.filter(u => u.lastActiveAt && new Date(u.lastActiveAt) >= todayStart).length,
        activeThisWeek: appUsers.filter(u => u.lastActiveAt && new Date(u.lastActiveAt) >= weekStart).length,
        proCount: appUsers.filter(u => getStatus(u) === 'active').length,
        trialCount: appUsers.filter(u => getStatus(u) === 'trial').length,
        expiredCount: appUsers.filter(u => ['expired','revoked'].includes(getStatus(u))).length,
        topEvents: [...eventCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([type,count]) => ({ type, count })),
      });
    } catch {
      toast({ description: 'Could not load metrics — check Supabase connection', variant: 'destructive' });
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadMetrics();
    else setLoading(false);
  }, [isAdmin, loadMetrics]);

  if (!isAdmin) return (
    <div className="max-w-md mx-auto text-center py-20 space-y-3">
      <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="text-lg font-semibold">Admin Access Required</h2>
      <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Admin</h1>
          <p className="text-xs text-muted-foreground">Users, access management, and platform data</p>
        </div>
        {tab === 'metrics' && (
          <Button size="sm" variant="outline" onClick={loadMetrics} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh
          </Button>
        )}
      </div>

      {/* Summary stats — always visible */}
      {metrics && (
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={Users} label="Total Users" value={metrics.total} />
          <Stat icon={Clock} label="Active Today" value={metrics.activeToday} sub={`${metrics.activeThisWeek} this week`} />
          <Stat icon={UserCheck} label="With Access" value={metrics.proCount + metrics.trialCount} sub={`${metrics.expiredCount} expired`} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {(['users','metrics','demo'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
              tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}>{t === 'demo' ? 'Demo Data' : t === 'metrics' ? 'Usage' : 'Users'}</button>
        ))}
      </div>

      {/* Users tab — full UserManagementPanel */}
      {tab === 'users' && <UserManagementPanel />}

      {/* Metrics tab */}
      {tab === 'metrics' && metrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Users} label="Registered" value={metrics.total} />
            <Stat icon={Clock} label="Active Today" value={metrics.activeToday} />
            <Stat icon={TrendingUp} label="Active This Week" value={metrics.activeThisWeek} />
            <Stat icon={UserCheck} label="Active Access" value={metrics.proCount + metrics.trialCount} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Access Breakdown</p>
            {[
              { label: 'Active', count: metrics.proCount, color: 'bg-emerald-500' },
              { label: 'Trial', count: metrics.trialCount, color: 'bg-blue-500' },
              { label: 'Expired / Revoked', count: metrics.expiredCount, color: 'bg-red-500' },
              { label: 'No Access', count: Math.max(0, metrics.total - metrics.proCount - metrics.trialCount - metrics.expiredCount), color: 'bg-muted-foreground/40' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <div className={cn('h-2 w-2 rounded-full shrink-0', row.color)} />
                <span className="text-sm flex-1">{row.label}</span>
                <span className="text-sm font-bold tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
          {metrics.topEvents.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent Activity (last 1,000 events)</p>
              {metrics.topEvents.map(e => (
                <div key={e.type} className="flex items-center gap-3">
                  <span className="text-sm flex-1 capitalize">{e.type.replace(/_/g,' ')}</span>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((e.count / metrics.topEvents[0].count) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-8 text-right">{e.count}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1">
                Use this to see which features agents use most — prioritize improvements to top-used actions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Demo */}
      {tab === 'demo' && <DemoTab />}
    </div>
  );
}
