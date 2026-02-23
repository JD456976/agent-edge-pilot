import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronRight, ChevronLeft, GripVertical, Plus, X, Save, Sparkles, Eye, MapPin, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'dropdown' | 'multiple_choice' | 'yes_no' | 'date';
  required: boolean;
  isDefault: boolean;
  options?: string[];
}

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'full_name', label: 'Full Name', type: 'text', required: true, isDefault: true },
  { key: 'email', label: 'Email Address', type: 'text', required: true, isDefault: true },
];

const OPTIONAL_FIELDS: FieldConfig[] = [
  { key: 'phone', label: 'Phone Number', type: 'text', required: false, isDefault: true },
  { key: 'working_with_agent', label: 'Are you working with an agent?', type: 'yes_no', required: false, isDefault: true },
  { key: 'selling_home', label: 'Are you selling a home?', type: 'yes_no', required: false, isDefault: true },
  { key: 'buy_timeline', label: 'When are you looking to buy?', type: 'dropdown', required: false, isDefault: true, options: ['ASAP', '1-3 months', '3-6 months', '6-12 months', 'Just browsing'] },
  { key: 'sell_timeline', label: 'When are you looking to sell?', type: 'dropdown', required: false, isDefault: true, options: ['ASAP', '1-3 months', '3-6 months', '6-12 months', 'Not selling'] },
  { key: 'price_range', label: 'Price Range', type: 'dropdown', required: false, isDefault: true, options: ['Under $200K', '$200K-$400K', '$400K-$600K', '$600K-$800K', '$800K-$1M', '$1M+'] },
  { key: 'areas_interest', label: 'Areas of Interest', type: 'text', required: false, isDefault: true },
  { key: 'property_type', label: 'Property Type', type: 'dropdown', required: false, isDefault: true, options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land'] },
  { key: 'visitor_notes', label: 'Notes / Questions', type: 'text', required: false, isDefault: true },
];

interface Props {
  onCreated: (id: string) => void;
  editingId: string | null;
  onClearEdit: () => void;
}

export function CreateOpenHouse({ onCreated, editingId, onClearEdit }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [notes, setNotes] = useState('');
  const [agentRole, setAgentRole] = useState<'listing_agent' | 'facilitator'>('listing_agent');
  const [selectedFields, setSelectedFields] = useState<FieldConfig[]>([...DEFAULT_FIELDS]);
  const [optionalEnabled, setOptionalEnabled] = useState<Record<string, boolean>>({ phone: true });
  const [customFields, setCustomFields] = useState<FieldConfig[]>([]);
  const [requireAll, setRequireAll] = useState(false);
  const [allowAnonymous, setAllowAnonymous] = useState(true);
  const [showContactCard, setShowContactCard] = useState(true);

  // Load existing open house for editing
  const { data: editingData } = useQuery({
    queryKey: ['open-house-edit', editingId],
    queryFn: async () => {
      if (!editingId) return null;
      const [ohRes, fieldsRes] = await Promise.all([
        supabase.from('open_houses').select('*').eq('id', editingId).single(),
        supabase.from('open_house_fields').select('*').eq('open_house_id', editingId).order('sort_order'),
      ]);
      if (ohRes.error) throw ohRes.error;
      return { oh: ohRes.data, fields: fieldsRes.data || [] };
    },
    enabled: !!editingId,
  });

  // Populate form when editing
  useEffect(() => {
    if (editingData) {
      const { oh, fields } = editingData;
      setAddress(oh.property_address);
      setEventDate(oh.event_date ? new Date(oh.event_date).toISOString().slice(0, 16) : '');
      setNotes(oh.notes || '');
      setAgentRole((oh as any).agent_role || 'listing_agent');
      const settings = oh.form_settings as any;
      setRequireAll(settings?.require_all ?? false);
      setAllowAnonymous(settings?.allow_anonymous ?? true);
      setShowContactCard(settings?.show_contact_card ?? true);

      // Restore field selections
      const optEn: Record<string, boolean> = {};
      const customs: FieldConfig[] = [];
      fields.forEach((f: any) => {
        const isDefaultRequired = DEFAULT_FIELDS.some(d => d.key === f.field_key);
        const isOptional = OPTIONAL_FIELDS.some(o => o.key === f.field_key);
        if (isOptional) {
          optEn[f.field_key] = true;
        } else if (!isDefaultRequired) {
          customs.push({
            key: f.field_key,
            label: f.field_label,
            type: f.field_type as any,
            required: f.is_required,
            isDefault: false,
            options: f.options as any,
          });
        }
      });
      setOptionalEnabled(optEn);
      setCustomFields(customs);
      setStep(1);
    }
  }, [editingData]);

  // Templates
  const { data: templates = [] } = useQuery({
    queryKey: ['oh-templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('open_house_templates').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleToggleOptional = (key: string) => {
    setOptionalEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const addCustomField = () => {
    setCustomFields(prev => [...prev, {
      key: `custom_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      isDefault: false,
    }]);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(prev => prev.filter((_, i) => i !== index));
  };

  const updateCustomField = (index: number, updates: Partial<FieldConfig>) => {
    setCustomFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const getAllFields = (): FieldConfig[] => {
    const optional = OPTIONAL_FIELDS.filter(f => optionalEnabled[f.key]);
    return [...DEFAULT_FIELDS, ...optional, ...customFields].map((f) => ({ ...f, required: requireAll ? true : f.required }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      if (editingId) {
        // UPDATE existing
        const { error: ohError } = await supabase
          .from('open_houses')
          .update({
            property_address: address,
            event_date: eventDate || null,
            notes: notes || null,
            agent_role: agentRole,
            form_settings: { require_all: requireAll, allow_anonymous: allowAnonymous, show_contact_card: showContactCard } as any,
          })
          .eq('id', editingId);
        if (ohError) throw ohError;

        // Replace fields
        await supabase.from('open_house_fields').delete().eq('open_house_id', editingId);
        const fields = getAllFields().map((f, i) => ({
          open_house_id: editingId,
          user_id: user.id,
          field_key: f.key,
          field_label: f.label,
          field_type: f.type,
          is_required: f.required,
          is_default: f.isDefault,
          sort_order: i,
          options: f.options ? f.options : null,
        }));
        if (fields.length > 0) {
          const { error: fError } = await supabase.from('open_house_fields').insert(fields);
          if (fError) throw fError;
        }
        return { id: editingId };
      } else {
        // INSERT new
        const { data: oh, error: ohError } = await supabase
          .from('open_houses')
          .insert({
            user_id: user.id,
            property_address: address,
            event_date: eventDate || null,
            notes: notes || null,
            agent_role: agentRole,
            form_settings: { require_all: requireAll, allow_anonymous: allowAnonymous, show_contact_card: showContactCard } as any,
          })
          .select()
          .single();
        if (ohError) throw ohError;

        const fields = getAllFields().map((f, i) => ({
          open_house_id: oh.id,
          user_id: user.id,
          field_key: f.key,
          field_label: f.label,
          field_type: f.type,
          is_required: f.required,
          is_default: f.isDefault,
          sort_order: i,
          options: f.options ? f.options : null,
        }));
        if (fields.length > 0) {
          const { error: fError } = await supabase.from('open_house_fields').insert(fields);
          if (fError) throw fError;
        }
        return oh;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['open-houses'] });
      toast.success(editingId ? 'Open house updated!' : 'Open house created! QR code is ready.');
      onCreated(result.id);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('open_house_templates').insert({
        user_id: user.id,
        name,
        fields: getAllFields() as any,
        form_settings: { require_all: requireAll, allow_anonymous: allowAnonymous, show_contact_card: showContactCard } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oh-templates'] });
      toast.success('Template saved');
    },
  });

  const resetForm = () => {
    setStep(1);
    setAddress('');
    setEventDate('');
    setNotes('');
    setAgentRole('listing_agent');
    setOptionalEnabled({ phone: true });
    setCustomFields([]);
    setRequireAll(false);
    setAllowAnonymous(true);
    setShowContactCard(true);
    onClearEdit();
  };

  const loadTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (!t) return;
    const fields = t.fields as unknown as FieldConfig[];
    const settings = t.form_settings as any;
    const optEn: Record<string, boolean> = {};
    const customs: FieldConfig[] = [];
    fields.forEach(f => {
      if (f.isDefault && !DEFAULT_FIELDS.some(d => d.key === f.key)) {
        optEn[f.key] = true;
      } else if (!f.isDefault) {
        customs.push(f);
      }
    });
    setOptionalEnabled(optEn);
    setCustomFields(customs);
    setRequireAll(settings?.require_all ?? false);
    setAllowAnonymous(settings?.allow_anonymous ?? true);
    setShowContactCard(settings?.show_contact_card ?? true);
    toast.success(`Template "${t.name}" loaded`);
  };

  // Preview flyer URL (mock for preview)
  const previewUrl = `${window.location.origin}/visit/preview`;

  const totalSteps = 4; // Added preview step

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Edit mode banner */}
      {editingId && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-3">
          <span className="text-sm font-medium text-primary">✏️ Editing Open House</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm}>Cancel Edit</Button>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${s === step ? 'bg-primary text-primary-foreground' : s < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {s === 4 ? <Eye className="h-3.5 w-3.5" /> : s}
            </div>
            {s < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Templates */}
      {templates.length > 0 && step === 2 && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Load Template:</span>
              {templates.map(t => (
                <Badge key={t.id} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => loadTemplate(t.id)}>
                  {t.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — Basic Info */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 1: Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="address">Property Address *</Label>
              <Input id="address" placeholder="123 Main St, City, State" value={address} onChange={e => setAddress(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="eventDate">Open House Date & Time</Label>
              <Input id="eventDate" type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="notes">Notes (internal)</Label>
              <Textarea id="notes" placeholder="Any notes for yourself..." value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>

            {/* Agent Role Toggle */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <Label className="text-sm font-semibold">Your Role at This Open House</Label>
              <RadioGroup value={agentRole} onValueChange={(v) => setAgentRole(v as any)} className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer">
                  <RadioGroupItem value="listing_agent" id="role-listing" className="mt-0.5" />
                  <div>
                    <Label htmlFor="role-listing" className="text-sm font-medium cursor-pointer">Listing Agent</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">You represent the seller and are hosting this open house for your listing.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer">
                  <RadioGroupItem value="facilitator" id="role-facilitator" className="mt-0.5" />
                  <div>
                    <Label htmlFor="role-facilitator" className="text-sm font-medium cursor-pointer">Facilitator / Buyer's Agent</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">You're hosting on behalf of another agent or prospecting for buyer leads at someone else's listing.</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Button onClick={() => setStep(2)} disabled={!address.trim()} className="w-full">
              Next: Configure Fields <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Fields */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 2: Form Fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Required Fields</p>
              {DEFAULT_FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-2 py-1.5 px-2 bg-primary/5 rounded mb-1">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm flex-1">{f.label}</span>
                  <Badge variant="secondary" className="text-[10px]">Required</Badge>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Optional Fields</p>
              {OPTIONAL_FIELDS.map(f => (
                <div key={f.key} className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/30">
                  <span className="text-sm">{f.label}</span>
                  <Switch checked={!!optionalEnabled[f.key]} onCheckedChange={() => handleToggleOptional(f.key)} />
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom Fields</p>
                <Button variant="ghost" size="sm" onClick={addCustomField} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add Field
                </Button>
              </div>
              {customFields.map((f, i) => (
                <div key={f.key} className="flex items-center gap-2 mb-2 p-2 border border-border rounded-lg">
                  <Input placeholder="Field label" value={f.label} onChange={e => updateCustomField(i, { label: e.target.value })} className="flex-1 h-8 text-sm" />
                  <Select value={f.type} onValueChange={v => updateCustomField(i, { type: v as any })}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="yes_no">Yes/No</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCustomField(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Next: Settings <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Settings */}
      {step === 3 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 3: Form Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Require all fields</p>
                <p className="text-xs text-muted-foreground">Make every field mandatory</p>
              </div>
              <Switch checked={requireAll} onCheckedChange={setRequireAll} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Allow anonymous browsing after submit</p>
                <p className="text-xs text-muted-foreground">Visitors can close the form after submitting</p>
              </div>
              <Switch checked={allowAnonymous} onCheckedChange={setAllowAnonymous} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Show agent contact card</p>
                <p className="text-xs text-muted-foreground">Display your contact info after submission</p>
              </div>
              <Switch checked={showContactCard} onCheckedChange={setShowContactCard} />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1">
                Next: Preview <Eye className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
              const name = prompt('Template name:');
              if (name) saveTemplateMutation.mutate(name);
            }}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save as Template
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Preview */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Flyer Preview */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Flyer & QR Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-xl p-6 bg-card text-center space-y-4 max-w-sm mx-auto">
                <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground">Welcome to Our Open House</p>
                <h2 className="text-xl font-bold leading-tight">{address}</h2>
                {eventDate && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(eventDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    {' at '}
                    {new Date(eventDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
                <div className="inline-block p-4 border-2 border-border rounded-2xl">
                  <QRCodeSVG
                    value={previewUrl}
                    size={160}
                    level="H"
                    includeMargin
                    bgColor="transparent"
                    fgColor="currentColor"
                    className="text-foreground"
                  />
                </div>
                <p className="text-sm font-semibold">📱 Scan to Sign In</p>
                <p className="text-xs text-muted-foreground">Receive updates on similar homes in your area</p>
                <div className="border-t border-border pt-4 mt-2">
                  <p className="text-sm font-semibold">{user?.email || 'Agent Name'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {agentRole === 'listing_agent' ? 'Listing Agent' : 'Facilitator'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Fields Preview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Form Fields Preview ({getAllFields().length} fields)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-sm mx-auto">
                {getAllFields().map(f => (
                  <div key={f.key} className="flex items-center justify-between text-sm py-1.5 px-3 bg-muted/30 rounded">
                    <span>{f.label}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-[9px]">{f.type}</Badge>
                      {f.required && <Badge variant="secondary" className="text-[9px]">Required</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Agent Role Summary */}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${agentRole === 'listing_agent' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'}`}>
                  {agentRole === 'listing_agent' ? '🏠' : '🤝'}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {agentRole === 'listing_agent' ? 'Hosting as Listing Agent' : 'Hosting as Facilitator'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {agentRole === 'listing_agent'
                      ? 'You represent the seller for this property.'
                      : 'You\'re prospecting or hosting on behalf of another agent.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Open House' : 'Create & Generate QR'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
