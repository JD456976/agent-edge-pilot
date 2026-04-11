import { useAuth } from '@/contexts/AuthContext';
import { TargetMarketSettings } from '@/components/TargetMarketSettings';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, User, LogOut, Info, Clock, Bot, Calendar, Volume2, Trash2, AlertTriangle, Shield, FileText, HelpCircle, ExternalLink, Camera, Bell, BellOff, Layers, BarChart3, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getNoisePrefs, setNoisePrefs, type DriftFrequency, type WeeklyReviewDefault, type StableHideAfter } from '@/lib/noiseGovernor';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useCallback, useMemo } from 'react';
import { DataExportSection } from '@/components/DataExportSection';
import { SubscriptionStatusSection } from '@/components/SubscriptionStatusSection';
import { ScoringCalibrationPanel } from '@/components/ScoringCalibrationPanel';
import { NetworkSettingsSection } from '@/components/NetworkSettingsSection';
import { MarketSettingsSection } from '@/components/MarketSettingsSection';
import { IncomeTargetSettings } from '@/components/IncomeTargetSettings';
import { SelfOptimizingSettingsPanel } from '@/components/SelfOptimizingSettingsPanel';
import { useMarketConditions } from '@/hooks/useMarketConditions';
import { useSessionMode, type SessionMode } from '@/hooks/useSessionMode';
import { useStrategicSettings } from '@/hooks/useStrategicSettings';
import { useSelfOptimizing } from '@/hooks/useSelfOptimizing';
import { getAutonomyLevel, setAutonomyLevel, getFeedbackStats, type AutonomyLevel } from '@/lib/preparedActions';
import { useHabitTracking } from '@/hooks/useHabitTracking';
import Admin from '@/pages/Admin';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { SkinSelector } from '@/components/SkinSelector';


function ProfileSection() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [editingName, setEditingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load avatar on mount
  useState(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('user_id', u.id).single();
      if ((profile as any)?.avatar_url) setAvatarUrl((profile as any).avatar_url);
    })();
  });

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image under 5MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop();
      const path = `${u.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: urlWithCacheBust } as any).eq('user_id', u.id);
      setAvatarUrl(urlWithCacheBust);
      toast({ description: 'Avatar updated!' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    }
    setUploading(false);
  }, []);

  const handleNameSave = useCallback(async () => {
    if (!displayName.trim()) return;
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    await supabase.from('profiles').update({ name: displayName.trim() } as any).eq('user_id', u.id);
    setEditingName(false);
    toast({ description: 'Name updated!' });
  }, [displayName]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><User className="h-4 w-4" /> Profile</h2>
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative group shrink-0">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-border">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            aria-label="Change avatar"
          >
            {uploading ? (
              <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Camera className="h-4 w-4 text-foreground" />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        {/* Info */}
        <div className="flex-1 space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            {editingName ? (
              <div className="flex gap-2 mt-0.5">
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="flex-1 text-sm font-medium bg-muted/60 border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleNameSave()}
                />
                <Button size="sm" variant="ghost" onClick={handleNameSave} className="text-xs">Save</Button>
              </div>
            ) : (
              <p className="text-sm font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => setEditingName(true)}>
                {user?.name} <span className="text-[10px] text-muted-foreground ml-1">(edit)</span>
              </p>
            )}
          </div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><p className="text-sm font-medium">{user?.email}</p></div>
          <div><Label className="text-xs text-muted-foreground">Role</Label><p className="text-sm font-medium capitalize">{user?.role}</p></div>
        </div>
      </div>
    </section>
  );
}

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState({
    overdueTasks: true,
    riskAlerts: true,
    opportunities: true,
    dailyBrief: true,
  });
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('notify_overdue_tasks, notify_risk_alerts, notify_opportunities, notify_daily_brief').eq('user_id', user.id).single();
      if (data) {
        setPrefs({
          overdueTasks: (data as any).notify_overdue_tasks ?? true,
          riskAlerts: (data as any).notify_risk_alerts ?? true,
          opportunities: (data as any).notify_opportunities ?? true,
          dailyBrief: (data as any).notify_daily_brief ?? true,
        });
      }
      setLoaded(true);
    })();
  });

  const updatePref = useCallback(async (key: string, dbKey: string, value: boolean) => {
    setPrefs(p => ({ ...p, [key]: value }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ [dbKey]: value } as any).eq('user_id', user.id);
  }, []);

  const NOTIF_OPTIONS = [
    { key: 'overdueTasks', dbKey: 'notify_overdue_tasks', label: 'Overdue task reminders', desc: 'Get notified when tasks pass their due date' },
    { key: 'riskAlerts', dbKey: 'notify_risk_alerts', label: 'Risk alerts', desc: 'Alerts when deals enter high-risk status' },
    { key: 'opportunities', dbKey: 'notify_opportunities', label: 'Opportunity signals', desc: 'Notifications for hot lead activity' },
    { key: 'dailyBrief', dbKey: 'notify_daily_brief', label: 'Daily brief reminder', desc: 'Morning reminder to check your Command Center' },
  ] as const;

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</h2>
      <p className="text-xs text-muted-foreground mb-3">Choose which push notifications you receive.</p>
      <div className="space-y-3">
        {NOTIF_OPTIONS.map(opt => (
          <div key={opt.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
            <Switch
              checked={prefs[opt.key as keyof typeof prefs]}
              onCheckedChange={v => updatePref(opt.key, opt.dbKey, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function LeadSourcesInsight() {
  const { leads } = useData();
  const sources = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const map = new Map<string, { count: number; totalScore: number; activeCount: number }>();
    for (const lead of leads) {
      const src = lead.source || 'Unknown';
      const entry = map.get(src) || { count: 0, totalScore: 0, activeCount: 0 };
      entry.count++;
      entry.totalScore += lead.engagementScore ?? 0;
      if (lead.lastTouchedAt && new Date(lead.lastTouchedAt) >= thirtyDaysAgo) {
        entry.activeCount++;
      }
      map.set(src, entry);
    }
    return Array.from(map.entries())
      .map(([source, d]) => ({ source, count: d.count, avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0, activeCount: d.activeCount }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const maxCount = Math.max(...sources.map(s => s.count), 1);

  if (sources.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 mb-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" /> Where Your Leads Come From
      </h2>
      <p className="text-xs text-muted-foreground mb-3">{leads.length} total leads across {sources.length} sources</p>

      <div className="space-y-2 mb-4">
        {sources.map(s => (
          <div key={s.source} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate">{s.source}</span>
              <span className="text-muted-foreground shrink-0 ml-2">{s.count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(s.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 px-1">
          <span>Source</span>
          <span className="text-right">Count</span>
          <span className="text-right">Avg Score</span>
          <span className="text-right">Active (30d)</span>
        </div>
        {sources.map(s => (
          <div key={s.source} className="grid grid-cols-4 gap-2 text-sm py-1.5 px-1 rounded hover:bg-muted/50">
            <span className="font-medium truncate">{s.source}</span>
            <span className="text-right text-muted-foreground">{s.count}</span>
            <span className="text-right text-muted-foreground">{s.avgScore}</span>
            <span className="text-right text-muted-foreground">{s.activeCount}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const TABS = ['Preferences', 'Admin'] as const;

export default function Settings() {
  const { user, logout, isProtected } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { currentMode, autoMode, override, setModeOverride } = useSessionMode();
  const { conditions: marketConditions, updateConditions: updateMarketConditions, resetConditions: resetMarketConditions } = useMarketConditions();
  const { settings: strategicSettings, updateSettings: updateStrategicSettings, resetSettings: resetStrategicSettings } = useStrategicSettings(user?.id);
  const [tab, setTab] = useState<typeof TABS[number]>('Preferences');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(() => getAutonomyLevel());
  const feedbackStats = getFeedbackStats();
  const { prefs: selfOptPrefs, analysis: selfOptAnalysis, updatePrefs: updateSelfOptPrefs, resetLearning: resetSelfOptLearning, exportSummary: exportSelfOptSummary } = useSelfOptimizing(user?.id);
  const { stats: habitStats } = useHabitTracking();
  const [noisePrefs, setNoisePrefsState] = useState(() => getNoisePrefs());
  const updateNoisePref = (partial: Partial<typeof noisePrefs>) => {
    const next = setNoisePrefs(partial);
    setNoisePrefsState(next);
  };

  const isAdmin = user?.role === 'admin' && isProtected;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Admin tab for admin users
  if (tab === 'Admin' && isAdmin) {
    return (
      <div className="animate-fade-in">
        {/* Tab bar */}
        <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 max-w-xs">
          {TABS.filter(t => t === 'Preferences' || isAdmin).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors',
                tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Admin />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      {/* Tab bar for admins */}
      {isAdmin && (
        <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 max-w-xs">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 text-sm font-medium py-1.5 rounded-md transition-colors',
                tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <h1 className="text-xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-4">Preferences and account</p>

      <FubSyncShortcut />


      {/* Theme & Skin */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Appearance</h2>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          <button onClick={toggleTheme} className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors">
            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="pt-2 border-t border-border">
          <SkinSelector />
        </div>
      </section>

      {/* Profile */}
      <ProfileSection />

      {/* Notification Preferences */}
      <NotificationPreferencesSection />

      <IncomeTargetSettings
        settings={strategicSettings}
        onUpdate={updateStrategicSettings}
        onReset={resetStrategicSettings}
      />

      {/* Target Market */}
      <TargetMarketSettings />

      {/* Lead Sources Insight */}
      <LeadSourcesInsight />

      {/* Self-Optimizing Mode */}
      <SelfOptimizingSettingsPanel
        prefs={selfOptPrefs}
        analysis={selfOptAnalysis}
        onUpdatePrefs={updateSelfOptPrefs}
        onReset={resetSelfOptLearning}
        onExport={exportSelfOptSummary}
      />

      {/* Scoring Calibration */}
      <ScoringCalibrationPanel />

      {/* Network Benchmarks */}
      <NetworkSettingsSection />

      {/* Market Conditions */}
      <MarketSettingsSection
        conditions={marketConditions}
        onUpdate={updateMarketConditions}
        onReset={resetMarketConditions}
      />

      {/* Autonomous Preparation */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Bot className="h-4 w-4" /> Autonomous Preparation</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Controls how aggressively Deal Pilot prepares actions for you. Nothing is ever sent automatically.
        </p>
        <Select
          value={autonomy}
          onValueChange={(v) => { setAutonomy(v as AutonomyLevel); setAutonomyLevel(v as AutonomyLevel); }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minimal">Minimal — Only urgent items</SelectItem>
            <SelectItem value="balanced">Balanced — Urgent + important</SelectItem>
            <SelectItem value="aggressive">Aggressive — Most opportunities</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Current: <span className="font-medium capitalize">{autonomy}</span>
        </p>
        {feedbackStats.total > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Feedback Summary</p>
            <div className="flex gap-4 text-xs">
              <span className="text-opportunity">{feedbackStats.positive} helpful</span>
              <span className="text-muted-foreground">{feedbackStats.neutral} somewhat</span>
              <span className="text-urgent">{feedbackStats.negative} not helpful</span>
            </div>
          </div>
        )}
      </section>

      {/* Daily Consistency */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Daily Consistency</h2>
        <p className="text-xs text-muted-foreground mb-3">Your daily operating loop performance.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Morning Brief</p>
            <p className="text-lg font-semibold">{habitStats.briefStreak} day{habitStats.briefStreak !== 1 ? 's' : ''}</p>
            <p className="text-[10px] text-muted-foreground">Consecutive days viewed</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">EOD Review</p>
            <p className="text-lg font-semibold">{habitStats.eodStreak} day{habitStats.eodStreak !== 1 ? 's' : ''}</p>
            <p className="text-[10px] text-muted-foreground">Consecutive days completed</p>
          </div>
        </div>
        {habitStats.last7.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Last 7 Days</p>
            <div className="flex gap-1">
              {habitStats.last7.map(day => (
                <div key={day.date} className="flex flex-col items-center gap-0.5">
                  <div className={`w-5 h-5 rounded-sm ${day.briefViewed && day.eodCompleted ? 'bg-opportunity/20' : day.briefViewed || day.eodCompleted ? 'bg-warning/20' : 'bg-muted'}`} />
                  <span className="text-[8px] text-muted-foreground">{new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Command Center View */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers className="h-4 w-4" /> Command Center View</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Minimal Mode progressively shows panels as your data grows. Override to see all panels immediately.
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Full View Override</p>
            <p className="text-xs text-muted-foreground">Show all panels regardless of maturity level</p>
          </div>
          <Switch
            checked={(() => { try { return localStorage.getItem('dp-full-view') === 'true'; } catch { return false; } })()}
            onCheckedChange={(v) => {
              localStorage.setItem('dp-full-view', v ? 'true' : 'false');
              toast({ description: v ? 'Full View enabled — all panels visible.' : 'Adaptive view restored.', duration: 3000 });
            }}
          />
        </div>
      </section>

      {/* Noise Controls */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Volume2 className="h-4 w-4" /> Noise Controls</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Control how often non-urgent signals appear. Reduces alert fatigue over time.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Drift alert frequency</Label>
            <Select value={noisePrefs.driftFrequency} onValueChange={(v) => updateNoisePref({ driftFrequency: v as DriftFrequency })}>
              <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="every_session">Every session</SelectItem>
                <SelectItem value="4_hours">Every 4 hours</SelectItem>
                <SelectItem value="daily">Once daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Weekly review default</Label>
            <Select value={noisePrefs.weeklyReviewDefault} onValueChange={(v) => updateNoisePref({ weeklyReviewDefault: v as WeeklyReviewDefault })}>
              <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Mon/Fri)</SelectItem>
                <SelectItem value="always_collapsed">Always collapsed</SelectItem>
                <SelectItem value="always_expanded">Always expanded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Hide stable status after</Label>
            <Select value={String(noisePrefs.stableHideAfterDays)} onValueChange={(v) => updateNoisePref({ stableHideAfterDays: v === 'never' ? 'never' : parseInt(v) as 3 | 5 })}>
              <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Daily Operating Mode */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Daily Operating Mode</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Auto-detected: <span className="font-medium capitalize">{autoMode}</span>. Override for testing.
        </p>
        <Select
          value={override ?? 'auto'}
          onValueChange={(v) => setModeOverride(v === 'auto' ? null : v as SessionMode)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (based on time)</SelectItem>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="midday">Midday</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Current mode: <span className="font-medium capitalize">{currentMode}</span>
        </p>
      </section>

      {/* Data Export */}
      <DataExportSection />

      {/* Account Actions */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4" /> Account</h2>
        
        {/* Sign Out */}
        <Button variant="outline" className="w-full mb-3" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>

        {/* Delete Account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Account & Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete Account Permanently?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>This action <strong>cannot be undone</strong>. This will permanently:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Delete your account and login credentials</li>
                  <li>Delete all your leads, deals, and tasks</li>
                  <li>Delete all activity history and touch logs</li>
                  <li>Delete your CRM integration keys</li>
                  <li>Delete all scoring preferences and settings</li>
                  <li>Remove you from all teams and organizations</li>
                </ul>
                <p className="text-sm pt-2">If you just want to take a break, consider signing out instead.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                      toast({ title: 'Error', description: 'You must be signed in to delete your account.', variant: 'destructive' });
                      return;
                    }
                    const res = await supabase.functions.invoke('delete-account', {
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    if (res.error || res.data?.error) {
                      throw new Error(res.data?.error || 'Deletion failed');
                    }
                    await supabase.auth.signOut();
                    navigate('/login');
                    toast({ title: 'Account Deleted', description: 'Your account and all data have been permanently deleted.' });
                  } catch (err: any) {
                    toast({ title: 'Error', description: err.message || 'Failed to delete account. Please try again.', variant: 'destructive' });
                  }
                }}
              >
                Yes, Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      {/* Subscription Status */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4" /> Subscription</h2>
        <SubscriptionStatusSection />
      </section>

      {/* Legal & Support Links */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> Legal & Support</h2>
        <div className="space-y-2">
          <a
            href="https://dealpilotapp.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Privacy Policy
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </a>
          <a
            href="https://dealpilotapp.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Terms of Service
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </a>
          <a
            href="mailto:support@dealpilotapp.com"
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent transition-colors text-sm"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Contact Support
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </a>
        </div>
      </section>

      <p className="text-center text-[10px] text-muted-foreground mb-8">Deal Pilot v1.0.0 (Build 1) · © {new Date().getFullYear()}</p>
    </div>
  );
}
