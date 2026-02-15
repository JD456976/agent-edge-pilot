/**
 * Hidden marketing page — used to capture App Store screenshots.
 * Access via /app-store-assets (not linked in nav).
 */
import { LayoutDashboard, TrendingUp, Shield, Zap, Bell, BarChart3 } from 'lucide-react';

const FEATURES = [
  { icon: LayoutDashboard, title: 'Command Center', desc: 'Your entire pipeline at a glance with intelligent prioritization.' },
  { icon: TrendingUp, title: 'Income Forecasting', desc: 'See projected earnings and close-date timelines with confidence bands.' },
  { icon: Shield, title: 'Risk Protection', desc: 'Proactive alerts when deals are ghosting, stalling, or at risk.' },
  { icon: Zap, title: 'AI-Powered Actions', desc: 'Smart follow-up drafts, prepared actions, and daily briefings.' },
  { icon: Bell, title: 'Smart Notifications', desc: 'Only the alerts that matter — overdue tasks, hot leads, and milestones.' },
  { icon: BarChart3, title: 'Network Insights', desc: 'Benchmark your performance against anonymized peer data.' },
];

export default function AppStoreAssets() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero screenshot frame */}
      <section className="relative overflow-hidden px-6 py-20 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative space-y-6 max-w-lg mx-auto">
          <img src="/icon-512.png" alt="Deal Pilot" className="h-20 w-20 rounded-2xl mx-auto shadow-xl shadow-primary/20" />
          <h1 className="text-4xl font-extrabold tracking-tight">
            Deal Pilot
          </h1>
          <p className="text-lg text-muted-foreground">
            Your AI-powered real estate command center. Close more deals with less stress.
          </p>
          <div className="flex items-center justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <span key={i} className="text-accent text-xl">★</span>
            ))}
            <span className="text-sm text-muted-foreground ml-2">5.0</span>
          </div>
        </div>
      </section>

      {/* Feature cards for screenshots */}
      <section className="px-6 pb-20 max-w-lg mx-auto">
        <div className="grid gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Promo banner */}
      <section className="px-6 pb-20 max-w-lg mx-auto text-center space-y-4">
        <p className="text-2xl font-bold">Stop guessing.<br />Start closing.</p>
        <p className="text-sm text-muted-foreground">
          Join agents who've increased their deal close rate with Deal Pilot's intelligence engine.
        </p>
      </section>
    </div>
  );
}
