import { ReactNode, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, RefreshCw, BarChart3, Settings, Sun, Moon, LogOut, User, Paintbrush } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspace, type WorkspaceType } from '@/contexts/WorkspaceContext';
import { useEntityNavigation } from '@/contexts/EntityNavigationContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CommandPalette } from '@/components/CommandPalette';
import { SkinSelector } from '@/components/SkinSelector';
import { QuickAddModal } from '@/components/QuickAddModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { usePushNotifications, checkOverdueTasks } from '@/hooks/usePushNotifications';

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

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace, openWorkspace, closeWorkspace } = useWorkspace();
  const { requestOpenEntity } = useEntityNavigation();
  const { tasks } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
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
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col border-r border-border bg-sidebar z-30">
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
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <SkinSelector />
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Toggle theme</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors">
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Sign out of your account</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* Main content area */}
      <div className="md:pl-56 min-h-screen flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Deal Pilot</span>
          </div>
          <div className="flex items-center gap-1">
            <SkinSelector />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
        </header>

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
    </div>
  );
}
