import { ReactNode, useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { ChevronDown, MoreHorizontal, Search, Wrench, Mic, LayoutDashboard, DoorOpen, ClipboardList, GitBranch, RefreshCw, CalendarDays } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, BarChart3, Settings, Sun, Moon, LogOut, User, Paintbrush, Bell, PenLine, Shield } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { SyncConflictDrawer } from '@/components/SyncConflictDrawer';
import { SyncProvider, useSyncContext } from '@/contexts/SyncContext';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { usePushNotifications, checkOverdueTasks } from '@/hooks/usePushNotifications';
import { KeyboardShortcutHint } from '@/components/KeyboardShortcutHint';
import { TrialBanner, RestrictedModeBanner } from '@/components/TrialBanner';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { NotificationPermissionPrompt } from '@/components/NotificationPermissionPrompt';
import { DemoBanner } from '@/components/DemoBanner';
import { MobileSearchOverlay } from '@/components/MobileSearchOverlay';

import { NAV_ITEMS as NAV_ITEMS_CONFIG } from '@/config/navigation';

// Paywall removed

type NavItem = { label: string; icon: React.ElementType } & (
  | { path: string; workspace?: undefined }
  | { workspace: WorkspaceType | 'home'; path?: undefined }
);

// FINAL NAV — DO NOT REMOVE OR REORDER ITEMS
// All 8 pages exist: Home, OpenHouse, CRM/Work, Deals, Sequences, Appointments, Settings, ObjectionCoach
const NAV_ITEMS: NavItem[] = NAV_ITEMS_CONFIG.map(item => ({
  ...item,
  workspace: item.workspace as WorkspaceType | 'home'
}));

const MOBILE_MAIN_TABS: NavItem[] = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { workspace: 'work', label: 'CRM', icon: RefreshCw },
  { workspace: 'deals', label: 'Deals', icon: ClipboardList },
  { workspace: 'sequences', label: 'Sequences', icon: GitBranch },
  { workspace: 'settings', label: 'Settings', icon: Settings },
];

const TOOLS_ITEMS: { label: string; icon: React.ElementType; workspace: WorkspaceType }[] = [];

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

function AppLayoutInner({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace, openWorkspace, closeWorkspace } = useWorkspace();
  const { requestOpenEntity } = useEntityNavigation();
  const { tasks, deals, alerts, hasSeededData, refreshData } = useData();
  const { canWrite, entitlementState } = useEntitlement();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const { isSyncing: syncing, conflicts, syncNow: runSync, resolveConflict, dismissConflict } = useSyncContext();

  // Auto-open conflict drawer when conflicts arrive
  useEffect(() => {
    if (conflicts.length > 0) setShowConflicts(true);
  }, [conflicts.length]);

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
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  useSwipeNavigation(isMobile);
  const { permission, requestPermission, sendNotification } = usePushNotifications();
  const lastCheckedRef = useRef<Set<string>>(new Set());
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  // Show pre-permission rationale on second session, not first
  useEffect(() => {
    if (permission === 'default') {
      const dismissed = localStorage.getItem('dp-notif-prompt-dismissed');
      if (dismissed) return;
      const sessionCount = parseInt(localStorage.getItem('dp-session-count') || '0', 10) + 1;
      localStorage.setItem('dp-session-count', String(sessionCount));
      if (sessionCount < 2) return; // Skip first session entirely
      const timer = setTimeout(() => setShowNotifPrompt(true), 15000);
      return () => clearTimeout(timer);
    }
  }, [permission]);

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
    // Handle imported NAV_ITEMS which use 'home' workspace instead of path
    if ('workspace' in item && item.workspace) {
      if (item.workspace === 'home') {
        return activeWorkspace === null;
      }
      return activeWorkspace === item.workspace;
    }
    return location.pathname === '/' && !activeWorkspace;
  };

  const handleNavClick = (item: NavItem) => {
    // Handle imported NAV_ITEMS which use 'home' workspace instead of path
    if ('workspace' in item && item.workspace) {
      if (item.workspace === 'home') {
        closeWorkspace();
        if (location.pathname !== '/') navigate('/');
      } else {
        openWorkspace(item.workspace as WorkspaceType);
      }
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
      {hasSeededData && <DemoBanner />}
      {/* Desktop sidebar — lg breakpoint so landscape phones use mobile nav */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col border-r border-border bg-sidebar z-30" data-tour="sidebar-nav">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(243,75%,59%)] to-[hsl(263,70%,58%)] flex items-center justify-center shadow-md shadow-primary/20">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-[-0.02em]">Deal Pilot</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {items.map(item => {
            const key = item.workspace || item.path || 'home';
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleNavClick(item)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-all duration-200 relative',
                      isActive(item) && 'bg-primary/10 text-primary border-l-2 border-primary pl-[10px]',
                      !isActive(item) && 'text-muted-foreground hover:bg-accent/10 hover:text-foreground border-l-2 border-transparent pl-[10px]'
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
        {/* Sync indicator removed — auto sync only */}
        <CollapsibleUtilities toggleTheme={toggleTheme} theme={theme} handleLogout={handleLogout} />
      </aside>

      {/* Main content area */}
      <div className="lg:pl-56 min-h-screen flex flex-col">
        {/* Mobile header — safe-area spacer + content row to keep icons below notch */}
        <header className="lg:hidden flex flex-col border-b border-border bg-card sticky top-0 z-20">
          {/* Safe-area spacer — pushes everything below the notch/status bar */}
          <div className="w-full" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
          {/* Actual header content */}
          <div className="flex items-center justify-between px-3 h-14">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[hsl(243,75%,59%)] to-[hsl(263,70%,58%)] flex items-center justify-center shadow-sm">
                <LayoutDashboard className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-[-0.02em]">Deal Pilot</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMobileSearch(true)} aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
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
                  <DropdownMenuItem onClick={() => { closeWorkspace(); openWorkspace('settings'); }}>
                    <Paintbrush className="h-4 w-4 mr-2" />
                    Appearance
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Trial / Restricted banners */}
        {entitlementState.isTrial && <TrialBanner />}
        {!canWrite && !entitlementState.isTrial && (
          <RestrictedModeBanner onUpgrade={() => setShowPaywall(true)} />
        )}

        {/* Page content */}
        <main className="flex-1 p-4 pb-24 lg:pb-6" style={{ paddingLeft: `max(1rem, env(safe-area-inset-left, 0px))`, paddingRight: `max(1rem, env(safe-area-inset-right, 0px))` }}>
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs — 4 main + Tools drawer */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 border-t border-border bg-card z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center h-14 px-1">
          {MOBILE_MAIN_TABS.map(item => {
            const key = item.workspace ?? item.path ?? 'home';
            return (
              <button
                key={key}
                onClick={() => handleNavClick(item)}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-1 rounded-lg transition-colors min-h-[44px] justify-center flex-1',
                  isActive(item) && 'text-primary',
                  !isActive(item) && 'text-muted-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium truncate max-w-[60px]">{item.label.length > 8 ? item.label.split(' ')[0] : item.label}</span>
              </button>
            );
          })}
          {/* Tools drawer trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                aria-label="Tools"
                className={cn(
                  'flex flex-col items-center gap-0.5 py-1 rounded-lg transition-colors min-h-[44px] justify-center flex-1',
                  TOOLS_ITEMS.some(t => activeWorkspace === t.workspace) ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Wrench className="h-5 w-5" />
                <span className="text-[10px] font-medium">Tools</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Tools</SheetTitle>
              </SheetHeader>
              <div className="grid gap-2 py-4">
                {TOOLS_ITEMS.map(tool => (
                  <button
                    key={tool.workspace}
                    onClick={() => {
                      openWorkspace(tool.workspace);
                      // Close sheet by clicking away — Sheet auto-closes on interaction
                    }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]',
                      activeWorkspace === tool.workspace
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    <tool.icon className="h-5 w-5" />
                    {tool.label}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Global Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        onOpenEntity={(entityId, entityType) => {
          if (location.pathname !== '/') navigate('/');
          openWorkspace('work');
          requestOpenEntity(entityId, entityType);
        }}
        onCreateTask={() => setShowQuickAdd(true)}
        onLogTouch={() => setShowQuickAdd(true)}
        onNavigateToTasks={() => {
          if (location.pathname !== '/') navigate('/');
          openWorkspace('work');
        }}
      />

      {/* Mobile Search Overlay */}
      <MobileSearchOverlay
        open={showMobileSearch}
        onClose={() => setShowMobileSearch(false)}
        onOpenEntity={(entityId, entityType) => {
          if (location.pathname !== '/') navigate('/');
          openWorkspace('work');
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

      {/* Paywall removed */}

      {/* Notification permission rationale prompt */}
      {showNotifPrompt && (
        <NotificationPermissionPrompt
          onAllow={async () => {
            setShowNotifPrompt(false);
            await requestPermission();
          }}
          onDismiss={() => {
            setShowNotifPrompt(false);
            localStorage.setItem('dp-notif-prompt-dismissed', Date.now().toString());
          }}
        />
      )}

      {/* Sync Conflict Drawer */}
      {showConflicts && conflicts.length > 0 && (
        <SyncConflictDrawer
          conflicts={conflicts}
          onResolve={resolveConflict}
          onDismiss={dismissConflict}
          onClose={() => setShowConflicts(false)}
        />
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { refreshData } = useData();
  return (
    <SyncProvider onSyncComplete={refreshData}>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SyncProvider>
  );
}
