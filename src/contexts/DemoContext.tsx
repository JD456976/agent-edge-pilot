import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Lead } from '@/types';

interface DemoContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  demoLeads: Lead[];
}

const DemoContext = createContext<DemoContextType>({ isDemoMode: false, toggleDemoMode: () => {}, demoLeads: [] });

const DEMO_LEADS: Lead[] = [
  {
    id: 'demo-1', name: 'Alex Johnson', source: 'Zillow',
    lastContactAt: new Date(Date.now() - 86400000).toISOString(),
    engagementScore: 92, notes: 'Pre-approved buyer, looking in 78704', statusTags: ['pre-approved'],
    assignedToUserId: '', createdAt: new Date().toISOString(),
    lastTouchedAt: new Date(Date.now() - 86400000).toISOString(),
    leadTemperature: 'hot', importedFrom: null, importRunId: null, importedAt: null,
    snoozeUntil: null, manualPreferences: null,
  },
  {
    id: 'demo-2', name: 'Maria Santos', source: 'Sphere',
    lastContactAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    engagementScore: 87, notes: 'Relocating from Austin, needs 3BR', statusTags: ['showing'],
    assignedToUserId: '', createdAt: new Date().toISOString(),
    lastTouchedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    leadTemperature: 'hot', importedFrom: null, importRunId: null, importedAt: null,
    snoozeUntil: null, manualPreferences: null,
  },
  {
    id: 'demo-3', name: 'David Lee', source: 'Referral',
    lastContactAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    engagementScore: 74, notes: 'First-time buyer, budget $350K', statusTags: [],
    assignedToUserId: '', createdAt: new Date().toISOString(),
    lastTouchedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    leadTemperature: 'warm', importedFrom: null, importRunId: null, importedAt: null,
    snoozeUntil: null, manualPreferences: null,
  },
  {
    id: 'demo-4', name: 'Sarah Williams', source: 'Open House',
    lastContactAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    engagementScore: 61, notes: 'Interested in condos downtown', statusTags: [],
    assignedToUserId: '', createdAt: new Date().toISOString(),
    lastTouchedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    leadTemperature: 'warm', importedFrom: null, importRunId: null, importedAt: null,
    snoozeUntil: null, manualPreferences: null,
  },
  {
    id: 'demo-5', name: 'Mike Chen', source: 'Website',
    lastContactAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    engagementScore: 45, notes: 'Browsing listings, early stage', statusTags: [],
    assignedToUserId: '', createdAt: new Date().toISOString(),
    lastTouchedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    leadTemperature: 'cool', importedFrom: null, importRunId: null, importedAt: null,
    snoozeUntil: null, manualPreferences: null,
  },
];

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode(prev => !prev);
  }, []);

  return (
    <DemoContext.Provider value={{ isDemoMode, toggleDemoMode, demoLeads: isDemoMode ? DEMO_LEADS : [] }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}

export function DemoBannerOverlay() {
  const { isDemoMode, toggleDemoMode } = useDemo();
  if (!isDemoMode) return null;
  return (
    <button
      onClick={toggleDemoMode}
      className="fixed top-0 left-0 right-0 z-[100] h-7 flex items-center justify-center text-xs font-semibold tracking-wide"
      style={{
        background: 'linear-gradient(90deg, hsl(45 93% 47%), hsl(40 96% 40%))',
        color: '#1a1a1a',
      }}
    >
      Demo Mode Active — tap to exit
    </button>
  );
}
