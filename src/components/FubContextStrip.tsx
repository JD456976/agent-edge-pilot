import { useState, useEffect } from 'react';
import { User, Clock, DollarSign, Landmark, Calendar, MapPin, Bed, Bath, Ruler, Tag, Shield, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FubPersonProfile } from '@/lib/intelAnalyzer';

interface Props {
  entityId: string;
  entity: any;
  personProfile?: FubPersonProfile | null;
}

/** FUB Intel Card — surfaces stage, tags, pre-approval, lender, collaborators, at-a-glance specs */
export function FubContextStrip({ entityId, entity, personProfile: externalProfile }: Props) {
  const [profile, setProfile] = useState<FubPersonProfile | null>(externalProfile ?? null);
  const [loading, setLoading] = useState(externalProfile === undefined);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (externalProfile !== undefined) { setProfile(externalProfile); setLoading(false); return; }
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
          limit: 1,
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
    profile.bedrooms || profile.bathrooms || profile.squareFeet || profile.assignedTo ||
    (profile.tags && profile.tags.length > 0) || profile.preApproved ||
    profile.preApprovalAmount || (profile.collaborators && profile.collaborators.length > 0);
  if (!hasContext) return null;

  // Categorize tags for visual grouping
  const intentTags = (profile.tags || []).filter(t => {
    const tl = t.toLowerCase();
    return ['buyer', 'seller', 'investor', 'renter', 'first time', 'first-time', 'relocation', 'luxury'].some(k => tl.includes(k));
  });
  const statusTags = (profile.tags || []).filter(t => {
    const tl = t.toLowerCase();
    return tl.startsWith('dp:') || ['hot', 'warm', 'cold', 'nurture', 'sphere', 'past client', 'vip'].some(k => tl.includes(k));
  });
  const enrichTags = (profile.tags || []).filter(t => {
    const tl = t.toLowerCase();
    return ['enrich', 'realscout', 'fello', 'zillow', 'trulia'].some(k => tl.includes(k));
  });
  const otherTags = (profile.tags || []).filter(t =>
    !intentTags.includes(t) && !statusTags.includes(t) && !enrichTags.includes(t)
  );

  const hasDetailSection = (profile.tags && profile.tags.length > 0) ||
    profile.preApprovalAmount || (profile.collaborators && profile.collaborators.length > 0);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-2">
        {/* Header row with core context */}
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">FUB Intel</p>
          {hasDetailSection && (
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Less' : 'More'}
              </button>
            </CollapsibleTrigger>
          )}
        </div>

        {/* Primary context row — always visible */}
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

        {/* AT A GLANCE row — always visible */}
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
            {profile.preApprovalAmount && (
              <Badge variant="outline" className="text-[10px] gap-1 py-0 border-opportunity/40 text-opportunity">
                <Shield className="h-2.5 w-2.5" />
                Pre-approved {profile.preApprovalAmount >= 1_000_000
                  ? `$${(profile.preApprovalAmount / 1_000_000).toFixed(1)}M`
                  : `$${Math.round(profile.preApprovalAmount / 1_000)}K`}
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

        {/* Expandable detail section */}
        <CollapsibleContent>
          <div className="space-y-2 pt-1.5 border-t border-border/50">
            {/* Tags */}
            {profile.tags && profile.tags.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Tags</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {intentTags.map(t => (
                    <Badge key={t} className="text-[9px] py-0 bg-primary/15 text-primary border-primary/30 hover:bg-primary/25">
                      {t}
                    </Badge>
                  ))}
                  {statusTags.map(t => (
                    <Badge key={t} variant="outline" className={cn(
                      "text-[9px] py-0",
                      t.toLowerCase().includes('hot') && "border-red-500/40 text-red-600 dark:text-red-400",
                      t.toLowerCase().includes('warm') && "border-orange-500/40 text-orange-600 dark:text-orange-400",
                      t.toLowerCase().includes('cold') && "border-blue-500/40 text-blue-600 dark:text-blue-400",
                    )}>
                      {t}
                    </Badge>
                  ))}
                  {enrichTags.map(t => (
                    <Badge key={t} variant="secondary" className="text-[9px] py-0">
                      {t}
                    </Badge>
                  ))}
                  {otherTags.map(t => (
                    <Badge key={t} variant="outline" className="text-[9px] py-0">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-Approval details */}
            {profile.preApproved && (
              <div className="flex items-center gap-1.5 text-xs">
                <Shield className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-muted-foreground">Pre-Approved:</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  Yes{profile.preApprovalAmount ? ` — $${profile.preApprovalAmount.toLocaleString()}` : ''}
                </span>
                {profile.lenderName && (
                  <span className="text-muted-foreground text-[10px]">
                    via {profile.lenderName}
                    {profile.lenderPhone && ` (${profile.lenderPhone})`}
                  </span>
                )}
              </div>
            )}

            {/* Collaborators */}
            {profile.collaborators && profile.collaborators.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Users className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Team</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.collaborators.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] py-0 gap-1">
                      <User className="h-2.5 w-2.5" />
                      {c.name || `Collaborator ${i + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Background note */}
            {profile.background && (
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1.5 leading-relaxed">
                <span className="font-medium text-foreground">Background:</span> {profile.background}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
