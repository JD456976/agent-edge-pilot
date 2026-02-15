import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, ListChecks, Settings, ShieldCheck, Sun, Moon, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWorkspace, type WorkspaceType } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type NavItem = { label: string; icon: React.ElementType } & (
  | { path: string; workspace?: undefined }
  | { workspace: WorkspaceType; path?: undefined }
);

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Command Center', icon: LayoutDashboard },
  { workspace: 'pipeline', label: 'Pipeline', icon: Target },
  { workspace: 'tasks', label: 'Tasks', icon: ListChecks },
  { workspace: 'settings', label: 'Settings', icon: Settings },
];

const ADMIN_ITEM: NavItem = { workspace: 'admin', label: 'Admin', icon: ShieldCheck };

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace, openWorkspace, closeWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const items = user?.role === 'admin' ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

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
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col border-r border-border bg-sidebar z-30">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Target className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Deal Pilot</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {items.map(item => {
            const key = item.workspace ?? item.path ?? 'home';
            return (
              <button
                key={key}
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
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors">
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="md:pl-56 min-h-screen flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Deal Pilot</span>
          </div>
          <div className="flex items-center gap-2">
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
    </div>
  );
}
