import { useState } from 'react';
import { Sun, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Lead } from '@/types';

interface Props {
  agentName: string;
  leads: Lead[];
  getHeatScore: (lead: Lead) => number;
  pipelineValue?: string;
}

export function AIMorningBrief({ agentName, leads, getHeatScore, pipelineValue }: Props) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const generate = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

      const topLeads = [...leads]
        .sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0))
        .slice(0, 3)
        .map(l => {
          const lastTouch = l.lastContactAt ? Math.round((now.getTime() - new Date(l.lastContactAt).getTime()) / 86400000) : null;
          return `${l.name} (score ${getHeatScore(l)}, ${lastTouch !== null ? lastTouch + 'd since last touch' : 'no touch date'})`;
        })
        .join('; ');

      const userMessage = `Today is ${todayStr}. Agent: ${agentName}. Pipeline: ${leads.length} active leads. Top 3 by engagement: ${topLeads || 'none yet'}. Give exactly 3 bullet points: (1) who to call first and why, (2) biggest risk in the pipeline right now, (3) one thing to do before noon.`;

      const resp = await fetch('/api/claude', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 400,
          system: 'You are a concise real estate sales coach. Give practical, specific advice.',
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const result = await resp.json();
      if (result?.type === 'error') throw new Error(result?.error?.message || 'Could not generate response.');
      const text = result?.content?.[0]?.text || 'Unable to generate brief.';

      setBrief(text);
      setExpanded(true);
    } catch (e) {
      console.error(e);
      setBrief('Could not reach the AI coach right now. Focus on your highest-engagement lead first, check for any deals at risk, and block 30 minutes for follow-ups before noon.');
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl p-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600">
      <div className="rounded-[10px] bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
              <Sun className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">{today}</p>
              <p className="text-sm font-semibold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                Your AI briefing is ready
              </p>
            </div>
          </div>
        </div>

        {/* CTA or Brief */}
        {!expanded ? (
          <Button
            onClick={generate}
            disabled={loading}
            className="w-full h-11 min-h-[44px] text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Generating your brief…' : 'Get My Brief'}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-base leading-relaxed font-medium" style={{ lineHeight: '1.6' }}>
              {brief}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={loading}
              className="text-[13px] h-9 min-h-[36px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing…' : 'Refresh Brief'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
