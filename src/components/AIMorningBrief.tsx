import { useState } from 'react';
import { Sun, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
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
      const leadsSummary = leads
        .slice(0, 15)
        .map(l => `${l.name} — ${getHeatScore(l)} — ${l.source || 'Direct'}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('ai-morning-brief', {
        body: {
          agent_name: agentName,
          leads_summary: leadsSummary,
          pipeline_value: pipelineValue || `${leads.length} active leads`,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ description: data.error, variant: 'destructive' });
        return;
      }

      setBrief(data.brief);
      setExpanded(true);
    } catch (e) {
      console.error(e);
      toast({ description: 'Could not generate brief. Try again.', variant: 'destructive' });
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
