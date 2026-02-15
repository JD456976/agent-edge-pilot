import { useState } from 'react';
import { cn } from '@/lib/utils';
import Pipeline from '@/pages/Pipeline';
import Tasks from '@/pages/Tasks';

const TABS = ['Pipeline', 'Tasks'] as const;

export default function Work() {
  const [tab, setTab] = useState<typeof TABS[number]>('Pipeline');

  return (
    <div className="animate-fade-in">
      {/* Tab bar */}
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

      {tab === 'Pipeline' ? <Pipeline /> : <Tasks />}
    </div>
  );
}
