import React, { useState } from "react";
import appIcon from "@/assets/app-icon.png";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { EntityNavigationProvider } from "@/contexts/EntityNavigationContext";
import { AppLayout } from "@/components/AppLayout";
import { WorkspaceOverlayShell } from "@/components/WorkspaceOverlayShell";
import { EntitlementProvider } from "@/contexts/EntitlementContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import Login from "@/pages/Login";
import BetaHomeScreen from "@/components/BetaHomeScreen";
import { OnboardingModal } from "@/components/OnboardingModal";
import Work from "@/pages/Work";
import Sync from "@/pages/Sync";
import Insights from "@/pages/Insights";
import Settings from "@/pages/Settings";
import CalendarPage from "@/pages/CalendarPage";
import NotFound from "@/pages/NotFound";
import Install from "@/pages/Install";
import AppStoreAssets from "@/pages/AppStoreAssets";
import OpenHouse from "@/pages/OpenHouse";
import ListingWriter from "@/pages/ListingWriter";
import CommissionCoach from "@/pages/CommissionCoach";
import { ReviewPrompt } from "@/components/ReviewPrompt";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingCompleted, setOnboardingCompleted } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(onboardingCompleted);

  // Keep local state in sync with context
  React.useEffect(() => {
    setOnboardingDone(onboardingCompleted);
  }, [onboardingCompleted]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="relative h-12 w-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" style={{ animationDuration: '1.5s' }} />
            <div className="relative h-12 w-12 rounded-xl overflow-hidden shadow-lg shadow-primary/25">
              <img src={appIcon} alt="Deal Pilot" className="h-12 w-12" />
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide">DEAL PILOT</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isActive) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold mb-2">Account Disabled</p>
          <p className="text-sm text-muted-foreground">Your account has been disabled. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Show onboarding modal if not completed (reviewers skip — handled via auto-seed)
  if (!onboardingDone && !isReviewer) {
    return (
      <AppLayout>
        <OnboardingModal onComplete={() => {
          setOnboardingCompleted();
          setOnboardingDone(true);
        }} />
        {children}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {children}
      <WorkspaceOverlays />
    </AppLayout>
  );
}

function WorkspaceOverlays() {
  const { activeWorkspace, closeWorkspace } = useWorkspace();

  const WORKSPACE_CONFIG: Record<string, { title: string; subtitle: string; Component: React.ComponentType }> = {
    work: { title: 'Work', subtitle: 'Pipeline and tasks', Component: Work },
    calendar: { title: 'Calendar', subtitle: 'Appointments, tasks & milestones', Component: CalendarPage },
    openhouse: { title: 'Open House Intelligence', subtitle: 'Capture visitors and follow up', Component: OpenHouse },
    listingwriter: { title: 'Listing Writer', subtitle: 'AI-powered listing descriptions', Component: ListingWriter },
    commissioncoach: { title: 'Commission Coach', subtitle: 'Defend your value and win listings', Component: CommissionCoach },
    sync: { title: 'Sync', subtitle: 'CRM integrations and imports', Component: Sync },
    insights: { title: 'Insights', subtitle: 'Forecast, stability, and review', Component: Insights },
    settings: { title: 'Settings', subtitle: 'Preferences and account', Component: Settings },
  };

  return (
    <>
      {Object.entries(WORKSPACE_CONFIG).map(([key, { title, subtitle, Component }]) => (
        <WorkspaceOverlayShell
          key={key}
          title={title}
          subtitle={subtitle}
          open={activeWorkspace === key}
          onClose={closeWorkspace}
        >
          <Component />
        </WorkspaceOverlayShell>
      ))}
    </>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const VisitorIntakeLazy = React.lazy(() => import('@/pages/VisitorIntake'));
  const ClientPortalLazy = React.lazy(() => import('@/pages/ClientPortal'));
  return (
    <Routes>
      <Route path="/login" element={loading ? null : (user ? <Navigate to="/" replace /> : <Login />)} />
      <Route path="/" element={<ProtectedRoute><BetaHomeScreen /></ProtectedRoute>} />
      <Route path="/visit/:token" element={<React.Suspense fallback={<div className="min-h-screen bg-background" />}><VisitorIntakeLazy /></React.Suspense>} />
      <Route path="/portal/:token" element={<React.Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: '#0F172A' }} />}><ClientPortalLazy /></React.Suspense>} />
      <Route path="/pipeline" element={<Navigate to="/?workspace=work" replace />} />
      <Route path="/tasks" element={<Navigate to="/?workspace=work" replace />} />
      <Route path="/settings" element={<Navigate to="/?workspace=settings" replace />} />
      <Route path="/admin" element={<Navigate to="/?workspace=settings" replace />} />
      <Route path="/install" element={<Install />} />
      <Route path="/app-store-assets" element={<AppStoreAssets />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <EntitlementProvider>
          <DataProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <WorkspaceProvider>
                  <EntityNavigationProvider>
                    <AppRoutes />
                    <ReviewPrompt />
                    <PWAUpdatePrompt />
                  </EntityNavigationProvider>
                </WorkspaceProvider>
              </BrowserRouter>
            </TooltipProvider>
          </DataProvider>
        </EntitlementProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
