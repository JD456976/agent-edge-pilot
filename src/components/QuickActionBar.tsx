import { useCallback } from 'react';
import { Phone, MessageSquare, Mail, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  entityType: 'deal' | 'lead';
  entityId: string;
  entityTitle: string;
  userId: string;
  onTouchLogged?: () => void;
  compact?: boolean;
}

const TOUCH_TYPES = [
  { type: 'call', label: 'Called', icon: Phone },
  { type: 'text', label: 'Texted', icon: MessageSquare },
  { type: 'email', label: 'Emailed', icon: Mail },
] as const;

export function QuickActionBar({ entityType, entityId, entityTitle, userId, onTouchLogged, compact }: Props) {
  const handleQuickTouch = useCallback(async (touchType: string) => {
    try {
      // Get user's org
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      const orgId = (profile as any)?.organization_id;
      if (!orgId) {
        toast({ description: 'Organization not found.', variant: 'destructive' });
        return;
      }

      // Log activity event
      await supabase.from('activity_events').insert({
        user_id: userId,
        organization_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        touch_type: touchType,
        note: `Quick ${touchType} logged`,
      });

      // Update last_touched_at
      if (entityType === 'deal') {
        await supabase.from('deals').update({ last_touched_at: new Date().toISOString() }).eq('id', entityId);
      } else {
        await supabase.from('leads').update({ last_touched_at: new Date().toISOString() }).eq('id', entityId);
      }

      toast({ description: `${touchType.charAt(0).toUpperCase() + touchType.slice(1)} logged for ${entityTitle}`, duration: 2000 });
      onTouchLogged?.();
    } catch {
      toast({ description: 'Failed to log touch.', variant: 'destructive' });
    }
  }, [entityType, entityId, entityTitle, userId, onTouchLogged]);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {TOUCH_TYPES.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); handleQuickTouch(type); }}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {TOUCH_TYPES.map(({ type, label, icon: Icon }) => (
        <Button
          key={type}
          size="sm"
          variant="outline"
          className="text-xs gap-1"
          onClick={(e) => { e.stopPropagation(); handleQuickTouch(type); }}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Button>
      ))}
    </div>
  );
}
