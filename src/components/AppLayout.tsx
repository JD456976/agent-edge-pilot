import { ReactNode, useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, RefreshCw, BarChart3, Settings, Sun, Moon, LogOut, User, Paintbrush, Bell } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspace, type WorkspaceType } from '@/contexts/WorkspaceContext';
import { useEntityNavigation } from '@/contexts/EntityNavigationContext';
import { useData } from '@/contexts/DataContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CommandPalette } from '@/components/CommandPalette';
import { SkinSelector } from '@/components/SkinSelector';
import { QuickAddModal } from '@/components/QuickAddModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { GuidedTour } from '@/components/GuidedTour';
import { WhatsNewModal } from '@/components/WhatsNewModal';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { usePushNotifications, checkOverdueTasks } from '@/hooks/usePushNotifications';
import { KeyboardShortcutHint } from '@/components/KeyboardShortcutHint';
import { TrialBanner, RestrictedModeBanner } from '@/components/TrialBanner';
import { useEntitlement } from '@/contexts/EntitlementContext';

const PaywallLazy = lazy(() => import('@/pages/Paywall'));

type NavItem = { label: string; icon: React.ElementType } & (
  | { path: string; workspace?: undefined }
  | { workspace: WorkspaceType; path?: undefined }
);

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { workspace: 'work', label: 'Work', icon: Briefcase },
  { workspace: 'sync', label: 'Sync', icon: RefreshCw },
  { workspace: 'insights', label: 'Insights', icon: BarChart3 },
  { workspace: 'settings', label: 'Settings', icon: Settings },
];

/** Collapsible sidebar utility section */
function CollapsibleUtilities({ toggleTheme, theme, handleLogout }: { toggleTheme: () => void; theme: string; handleLogout: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-label={open ? 'Collapse utilities' : 'Expand utilities'}
      >
        <span>Utilities</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <div className="px-2 pb-3 space-y-1 animate-fade-in">
          <SkinSelector />
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Toggle theme</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors" aria-label="Sign out of your account">
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Sign out of your account</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace, openWorkspace, closeWorkspace } = useWorkspace();
  const { requestOpenEntity } = useEntityNavigation();
  const { tasks, deals, alerts } = useData();
  const { canWrite, entitlementState } = useEntitlement();
  const [showPaywall, setShowPaywall] = useState(false);

  // Compute urgency dots for sidebar
  const urgentCounts = useMemo(() => {
    const overdue = tasks.filter(t => !t.completedAt && new Date(t.dueAt) < new Date()).length;
    const riskDeals = deals.filter(d => d.stage !== 'closed' && d.riskLevel === 'red').length;
    return {
      work: overdue,
      sync: 0, // could track pending sync items
      insights: riskDeals,
      settings: 0,
    } as Record<string, number>;
  }, [tasks, deals]);
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const isMobile = useIsMobile();
  useSwipeNavigation(isMobile);
  const { permission, requestPermission, sendNotification } = usePushNotifications();
  const lastCheckedRef = useRef<Set<string>>(new Set());

  // Request notification permission on first load
  useEffect(() => {
    if (permission === 'default') {
      // Delay to avoid intrusive prompt
      const timer = setTimeout(() => requestPermission(), 10000);
      return () => clearTimeout(timer);
    }
  }, [permission, requestPermission]);

  // Check for overdue tasks every 5 minutes
  useEffect(() => {
    if (permission !== 'granted') return;
    const interval = setInterval(() => {
      checkOverdueTasks(tasks, sendNotification, lastCheckedRef);
    }, 5 * 60 * 1000);
    // Check immediately too
    checkOverdueTasks(tasks, sendNotification, lastCheckedRef);
    return () => clearInterval(interval);
  }, [tasks, permission, sendNotification]);

  const items = NAV_ITEMS;

  const isActive = (item: NavItem) => {
    if (item.workspace) return activeWorkspace === item.workspace;
    return location.pathname === '/' && !activeWorkspace;
  };

  const handleNavClick = (item: NavItem) => {
    if (item.workspace) {
      openWorkspace(item.workspace);
    } else {
      closeWorkspace();
      if (location.pathname !== '/') navigate('/');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col border-r border-border bg-sidebar z-30" data-tour="sidebar-nav">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
            <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-tight">Deal Pilot</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {items.map(item => {
            const key = item.workspace ?? item.path ?? 'home';
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleNavClick(item)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left',
                      isActive(item)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <div className="relative">
                      <item.icon className="h-4 w-4" />
                      {item.workspace && urgentCounts[item.workspace] > 0 && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-urgent" />
                      )}
                    </div>
                    {item.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <SyncStatusIndicator />
        <CollapsibleUtilities toggleTheme={toggleTheme} theme={theme} handleLogout={handleLogout} />
      </aside>

      {/* Main content area */}
      <div className="md:pl-56 min-h-screen flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-3 h-14 border-b border-border bg-card sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Deal Pilot</span>
          </div>
          <div className="flex items-center gap-0.5">
            <NotificationBell alerts={alerts} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors" aria-label="Account menu">
                  <User className="h-4 w-4 text-primary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {user?.email && (
                  <>
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium truncate">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => { closeWorkspace(); openWorkspace('settings'); }}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { /* skin selector could open here */ }}>
                  <Paintbrush className="h-4 w-4 mr-2" />
                  Change Skin
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Trial / Restricted banners */}
        {entitlementState.isTrial && <TrialBanner />}
        {!canWrite && !entitlementState.isTrial && (
          <RestrictedModeBanner onUpgrade={() => setShowPaywall(true)} />
        )}

        {/* Page content */}
        <main className="flex-1 p-4 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-card z-30 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {items.map(item => {
            const key = item.workspace ?? item.path ?? 'home';
            return (
              <button
                key={key}
                onClick={() => handleNavClick(item)}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors min-w-0',
                  isActive(item) ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium truncate">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        onOpenEntity={(entityId, entityType) => {
          // Navigate to Command Center, close workspace, and request entity open
          closeWorkspace();
          if (location.pathname !== '/') navigate('/');
          requestOpenEntity(entityId, entityType);
        }}
        onCreateTask={() => setShowQuickAdd(true)}
        onLogTouch={() => setShowQuickAdd(true)}
      />

      {showQuickAdd && (
        <QuickAddModal defaultType="task" onClose={() => setShowQuickAdd(false)} />
      )}

      {/* Keyboard Shortcuts Dialog (? key) */}
      <KeyboardShortcutsDialog />

      {/* First-session guided tour */}
      <GuidedTour />

      {/* What's New changelog */}
      <WhatsNewModal />

      {/* Keyboard shortcut hint for new users */}
      <KeyboardShortcutHint />

      {/* Paywall modal triggered by restricted mode */}
      {showPaywall && (
        <div className="fixed inset-0 z-50 bg-background">
          <PaywallLazy onDismiss={() => setShowPaywall(false)} showDismiss />
        </div>
      )}
    </div>
  );
}
