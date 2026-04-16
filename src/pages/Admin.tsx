import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users, ShieldCheck, Clock, TrendingUp, RefreshCw, Search,
  MoreHorizontal, X, UserCheck, UserX, Database, Trash2,
  Sparkles, Activity, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, addDays } from 'date-fns';

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

const STATUS: Record<AccessStatus, { label: string; cls: string }> = {
  active:   { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  trial:    { label: 'Trial',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  expiring: { label: 'Expiring',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  expired:  { label: 'Expired',    cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  revoked:  { label: 'Revoked',    cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  none:     { label: 'No Access',  cls: 'bg-muted text-muted-foreground border-border' },
};

const DURATION_OPTS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

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

function GrantModal({ user, onClose, onDone }: { user: AppUser; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { logAdminAction } = useAuth();

  const effectiveDays = useCustom ? (parseInt(customDays) || 0) : days;
  const expiresDate = effectiveDays > 0 ? addDays(new Date(), effectiveDays) : null;

  const grant = async () => {
    if (!expiresDate) return;
    setSaving(true);
    try {
      await supabase.from('user_entitlements' as any).upsert({
        user_id: user.userId,
        is_pro: true,
        is_trial: true,
        expires_at: expiresDate.toISOString(),
        source: 'admin_grant',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await logAdminAction('grant_access', { targetUserId: user.userId, days: effectiveDays, expiresAt: expiresDate.toISOString() });
      toast({ description: `Access granted to ${user.name || user.email} · expires ${format(expiresDate, 'MMM d, yyyy')}` });
      onDone();
    } catch (e: any) {
      toast({ description: e.message || 'Failed', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Grant Access</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Access Duration</p>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_OPTS.map(o => (
              <button key={o.days} onClick={() => { setDays(o.days); setUseCustom(false); }}
                className={cn('py-2 rounded-lg text-sm font-medium border transition-colors',
                  !useCustom && days === o.days
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}>{o.label}</button>
            ))}
            <button onClick={() => setUseCustom(true)}
              className={cn('py-2 rounded-lg text-sm font-medium border transition-colors col-span-3',
                useCustom ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              )}>Custom…</button>
          </div>

          {useCustom && (
            <div className="flex items-center gap-2">
              <Input type="number" min="1" max="365" value={customDays}
                onChange={e => setCustomDays(e.target.value.replace(/\D/g, ''))}
                placeholder="Days" className="w-24 bg-muted/30" autoFocus />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}

          {expiresDate && (
            <p className="text-xs text-muted-foreground">
              Expires <span className="font-medium text-foreground">{format(expiresDate, 'MMMM d, yyyy')}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancel</Button>
          <Button onClick={grant} className="flex-1" disabled={saving || !expiresDate}>
            {saving ? 'Saving…' : 'Grant Access'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, onGrant, onRevoke }: {
  user: AppUser;
  onGrant: (u: AppUser) => void;
  onRevoke: (u: AppUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const st = getStatus(user);
  const cfg = STATUS[st];
  const lastActive = user.lastActiveAt
    ? (() => {
        const d = differenceInDays(new Date(), new Date(user.lastActiveAt));
        return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
      })()
    : 'Never';

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors border-b border-border/40 last:border-0">
      <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <span className="text-[11px] font-bold text-primary">
          {(user.name || user.email).split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.name || '—'}</p>
        <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
      </div>
      <div className="hidden sm:flex flex-col items-end shrink-0">
        <p className="text-[11px] text-muted-foreground">{lastActive}</p>
        {user.expiresAt && !['expired', 'revoked'].includes(st) && (
          <p className="text-[10px] text-muted-foreground/60">exp {format(new Date(user.expiresAt), 'MMM d')}</p>
        )}
      </div>
      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0', cfg.cls)}>
        {cfg.label}
      </span>
      <div className="relative shrink-0">
        <button onClick={() => setOpen(o => !o)}
          className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-8 z-50 min-w-[160px] bg-card border border-border rounded-xl shadow-xl py-1">
              <button onClick={() => { onGrant(user); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/50 text-left">
                <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                {['active','trial','expiring'].includes(st) ? 'Extend Access' : 'Grant Access'}
              </button>
              {['active','trial','expiring'].includes(st) && (
                <button onClick={() => { onRevoke(user); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/50 text-left text-destructive">
                  <UserX className="h-3.5 w-3.5" />Revoke Access
                </button>
              )}
            </div>
          </>
        )}
      </div>
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
  const { user, logAdminAction } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [search, setSearch] = useState('');
  const [grantTarget, setGrantTarget] = useState<AppUser | null>(null);
  const [tab, setTab] = useState<'users' | 'metrics' | 'demo'>('users');
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === 'admin' || isAdminEmail(user?.email);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [profilesRes, rolesRes, entRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('user_id,name,email,status,is_deleted,created_at,last_active_at').order('created_at', { ascending: false }),
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
          userId: p.user_id, name: p.name || '', email: p.email || '',
          role: roleMap.get(p.user_id) || 'agent',
          status: p.is_deleted ? 'removed' : (p.status || 'active'),
          createdAt: p.created_at, lastActiveAt: p.last_active_at ?? null,
          isPro: ent?.is_pro ?? false, isTrial: ent?.is_trial ?? false,
          expiresAt: ent?.expires_at ?? null, source: ent?.source ?? null,
        };
      });

      setUsers(appUsers);

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
      toast({ description: 'Could not load — check Supabase connection', variant: 'destructive' });
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin, load]);

  const revoke = async (u: AppUser) => {
    try {
      await supabase.from('user_entitlements' as any).upsert({
        user_id: u.userId, is_pro: false, is_trial: false,
        source: 'admin_revoked', updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await logAdminAction('revoke_access', { targetUserId: u.userId });
      toast({ description: `Access revoked for ${u.name || u.email}` });
      load();
    } catch (e: any) { toast({ description: e.message || 'Failed', variant: 'destructive' }); }
  };

  if (!isAdmin) return (
    <div className="max-w-md mx-auto text-center py-20 space-y-3">
      <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="text-lg font-semibold">Admin Access Required</h2>
      <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
    </div>
  );

  const filtered = users.filter(u => !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Admin</h1>
          <p className="text-xs text-muted-foreground">Users, access management, and platform data</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh
        </Button>
      </div>

      {/* Stats */}
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

      {/* Users */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted/30 h-9 text-sm" />
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
            ) : filtered.map(u => (
              <UserRow key={u.userId} user={u} onGrant={setGrantTarget} onRevoke={revoke} />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground text-right">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Metrics */}
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

      {/* Grant modal */}
      {grantTarget && (
        <GrantModal user={grantTarget} onClose={() => setGrantTarget(null)}
          onDone={() => { setGrantTarget(null); load(); }} />
      )}
    </div>
  );
}
