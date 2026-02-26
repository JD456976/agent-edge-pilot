import { useState, useEffect } from 'react';
import { User, Clock, DollarSign, Landmark, Calendar, MapPin, Bed, Bath, Ruler } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FubPersonProfile } from '@/lib/intelAnalyzer';

interface Props {
  entityId: string;
  entity: any;
  personProfile?: FubPersonProfile | null;
}

/** Compact FUB context strip — shows stage, timeframe, lender, AT A GLANCE inline */
export function FubContextStrip({ entityId, entity, personProfile: externalProfile }: Props) {
  const [profile, setProfile] = useState<FubPersonProfile | null>(externalProfile ?? null);
  const [loading, setLoading] = useState(!externalProfile);

  useEffect(() => {
    if (externalProfile) { setProfile(externalProfile); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { callEdgeFunction } = await import('@/lib/edgeClient');
        const importedFrom = entity?.importedFrom || entity?.imported_from;
        if (!importedFrom?.startsWith('fub:')) { setLoading(false); return; }
        const fubPersonId = importedFrom.replace('fub:', '');
        const result = await callEdgeFunction('fub-activity', {
          fub_person_id: parseInt(fubPersonId),
          entity_id: entityId,
          limit: 1, // We only need the profile, not activity
        });
        if (!cancelled && result?.personProfile) {
          setProfile(result.personProfile as FubPersonProfile);
        }
      } catch { /* non-critical */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [entityId, entity, externalProfile]);

  if (loading || !profile) return null;

  const hasContext = profile.stage || profile.timeFrame || profile.lenderName ||
    profile.bedrooms || profile.bathrooms || profile.squareFeet || profile.assignedTo;
  if (!hasContext) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-2">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">FUB Context</p>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {profile.stage && (
          <ContextChip icon={MapPin} label="Stage" value={profile.stage} accent />
        )}
        {profile.timeFrame && (
          <ContextChip icon={Calendar} label="Timeframe" value={profile.timeFrame} />
        )}
        {profile.lenderName && (
          <ContextChip icon={Landmark} label="Lender" value={profile.lenderName} />
        )}
        {profile.assignedTo && (
          <ContextChip icon={User} label="Agent" value={profile.assignedTo} />
        )}
      </div>

      {/* AT A GLANCE row */}
      {(profile.bedrooms || profile.bathrooms || profile.squareFeet || profile.price) && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider mr-1">At a Glance</span>
          {profile.price && (
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <DollarSign className="h-2.5 w-2.5" />
              {profile.price >= 1_000_000
                ? `${(profile.price / 1_000_000).toFixed(1)}M`
                : `${Math.round(profile.price / 1_000)}K`}
            </Badge>
          )}
          {profile.bedrooms && (
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <Bed className="h-2.5 w-2.5" />
              {profile.bedrooms} bd
            </Badge>
          )}
          {profile.bathrooms && (
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <Bath className="h-2.5 w-2.5" />
              {profile.bathrooms} ba
            </Badge>
          )}
          {profile.squareFeet && (
            <Badge variant="outline" className="text-[10px] gap-1 py-0">
              <Ruler className="h-2.5 w-2.5" />
              {profile.squareFeet.toLocaleString()} sqft
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

function ContextChip({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className={cn('h-3 w-3', accent ? 'text-primary' : 'text-muted-foreground')} />
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn('font-medium', accent && 'text-primary')}>{value}</span>
    </div>
  );
}
