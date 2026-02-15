import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, User, LogOut, Info, Clock, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ScoringCalibrationPanel } from '@/components/ScoringCalibrationPanel';
import { NetworkSettingsSection } from '@/components/NetworkSettingsSection';
import { MarketSettingsSection } from '@/components/MarketSettingsSection';
import { IncomeTargetSettings } from '@/components/IncomeTargetSettings';
import { useMarketConditions } from '@/hooks/useMarketConditions';
import { useSessionMode, type SessionMode } from '@/hooks/useSessionMode';
import { useStrategicSettings } from '@/hooks/useStrategicSettings';
import { getAutonomyLevel, setAutonomyLevel, getFeedbackStats, type AutonomyLevel } from '@/lib/preparedActions';
import Admin from '@/pages/Admin';
import { cn } from '@/lib/utils';

const TABS = ['Preferences', 'Admin'] as const;

export default function Settings() {
  const { user, logout, isReviewer } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { currentMode, autoMode, override, setModeOverride } = useSessionMode();
  const { conditions: marketConditions, updateConditions: updateMarketConditions, resetConditions: resetMarketConditions } = useMarketConditions();
  const { settings: strategicSettings, updateSettings: updateStrategicSettings, resetSettings: resetStrategicSettings } = useStrategicSettings(user?.id);
  const [tab, setTab] = useState<typeof TABS[number]>('Preferences');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(() => getAutonomyLevel());
  const feedbackStats = getFeedbackStats();

  const isAdmin = user?.role === 'admin';

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
      <p className="text-sm text-muted-foreground mb-6">Preferences and account</p>

      {isReviewer && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 mb-4 flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Reviewer Demo Mode is active.</span>
        </div>
      )}

      {/* Theme */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Appearance</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          <button onClick={toggleTheme} className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors">
            <span className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-lg border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><User className="h-4 w-4" /> Profile</h2>
        <div className="space-y-3">
          <div><Label className="text-xs text-muted-foreground">Name</Label><p className="text-sm font-medium">{user?.name}</p></div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><p className="text-sm font-medium">{user?.email}</p></div>
          <div><Label className="text-xs text-muted-foreground">Role</Label><p className="text-sm font-medium capitalize">{user?.role}</p></div>
        </div>
      </section>

      {/* Strategic Targets */}
      <IncomeTargetSettings
        settings={strategicSettings}
        onUpdate={updateStrategicSettings}
        onReset={resetStrategicSettings}
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

      {/* Sign out */}
      <Button variant="outline" className="w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Sign Out
      </Button>
    </div>
  );
}
