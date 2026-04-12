import { useState, useCallback } from 'react';
import { Sun, RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Lead } from '@/types';

interface Props {
  agentName: string;
  leads: Lead[];
  appointmentsToday: number;
  streak: number;
}

const CACHE_KEY = 'dealPilot_morningBrief';

function getCached(): { text: string; date: string } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.date === new Date().toDateString()) return parsed;
    return null;
  } catch { return null; }
}

export function HomeMorningBrief({ agentName, leads, appointmentsToday, streak }: Props) {
  const cached = getCached();
  const [expanded, setExpanded] = useState(false);
  const [brief, setBrief] = useState<string | null>(cached?.text || null);
  const [loading, setLoading] = useState(false);


  if (hour < 6 || hour >= 12) return null;

  const hotLeads = leads.filter(l => {
    let score = l.engagementScore || 0;
    if (l.leadTemperature === 'hot') score = Math.max(score, 75);
    return score >= 75;
  });

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const { data, error } = await supabase.functions.invoke('ai-morning-brief', {
        body: {
          agent_name: agentName,
          leads_summary: leads.slice(0, 5).map(l => `${l.name} — score ${l.engagementScore || 0} — ${l.source || 'Direct'}`).join('\n'),
          pipeline_value: `${leads.length} active leads, ${hotLeads.length} hot, ${appointmentsToday} appointments today, ${streak}-day streak. Today is ${dayOfWeek}.`,
        },
      });
      if (error) throw error;
      const text = data?.brief || 'Unable to generate brief.';
      setBrief(text);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ text, date: new Date().toDateString() }));
    } catch (e) {
      console.error('Morning brief error:', e);
      setBrief('Focus on your highest-scoring lead first, follow up on any pending appointments, and block 30 minutes for outreach before lunch.');
    } finally {
      setLoading(false);
    }
  }, [agentName, leads, hotLeads.length, appointmentsToday, streak]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    if (!brief) generate();
  }, [brief, generate]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(230 60% 20%), hsl(250 50% 25%))' }}>
      {!expanded ? (
        <button
          onClick={handleExpand}
          className="w-full flex items-center gap-2.5 p-3.5 text-left hover:bg-white/5 transition-colors"
        >
          <Sun className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-white/90 flex-1">Morning Brief — tap to generate</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/40" />
        </button>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-white/90">☀️ Morning Brief</span>
            </div>
            <button onClick={() => setExpanded(false)} className="text-white/40 hover:text-white/70 transition-colors">
              <ChevronDown className="h-4 w-4 rotate-180" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-3">
              <RefreshCw className="h-4 w-4 text-white/60 animate-spin" />
              <span className="text-sm text-white/60">Generating your brief…</span>
            </div>
          ) : brief ? (
            <div className="space-y-3">
              <p className="text-sm text-white/85 leading-relaxed">{brief}</p>
              <Button
                size="sm"
                variant="ghost"
                className="text-[12px] h-8 text-white/50 hover:text-white/80 hover:bg-white/10"
                onClick={generate}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
