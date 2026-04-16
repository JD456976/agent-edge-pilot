import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Copy, Check, Loader2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const STYLES = ['Professional', 'Warm', 'Luxury', 'High Energy'] as const;
type WritingStyle = typeof STYLES[number];

interface ListingResults {
  mls: string;
  social: string;
  email: string;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export default function ListingWriter() {
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sqft, setSqft] = useState('');
  const [price, setPrice] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [features, setFeatures] = useState('');
  const [angle, setAngle] = useState('');
  const [style, setStyle] = useState<WritingStyle>('Professional');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ListingResults | null>(null);

  const canGenerate = bedrooms && bathrooms && sqft && price && propertyType && neighborhood;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResults(null);

    try {
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          system: 'You are a real estate listing copywriter. Always respond with valid JSON only, no markdown fences.',
          messages: [{ role: 'user', content: `Write 3 real estate listing descriptions for:\n${bedrooms}bd/${bathrooms}ba, ${sqft} sqft, ${propertyType}\nPrice: ${price} | Location: ${neighborhood}${yearBuilt ? ` | Built: ${yearBuilt}` : ''}\nFeatures: ${features || 'none specified'}\nSelling angle: ${angle || 'none'}\nStyle: ${style}\n\nReturn ONLY this JSON:\n{"mls":"150-200 word professional MLS description","social":"80-110 word social post with hashtags","email":"120-160 word warm email with call to action"}` }],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const result = await resp.json();
      const text = result?.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const data = JSON.parse(clean);
      if (data?.error) throw new Error(data.error);
      setResults(data as ListingResults);
    } catch (err: any) {
      console.error('Listing generation error:', err);
      toast.error(err?.message || 'Failed to generate descriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resultCards = results
    ? [
        { label: 'MLS Listing', text: results.mls },
        { label: 'Social Media', text: results.social },
        { label: 'Client Email', text: results.email },
      ]
    : [];

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-8">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
          <PenLine className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Listing Writer</h1>
          <p className="text-xs text-muted-foreground">AI-powered listing descriptions in seconds</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Bedrooms</Label>
            <Input type="number" min={0} placeholder="3" value={bedrooms} onChange={e => setBedrooms(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Bathrooms</Label>
            <Input type="number" min={0} step={0.5} placeholder="2" value={bathrooms} onChange={e => setBathrooms(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Square Footage</Label>
            <Input type="number" min={0} placeholder="2,100" value={sqft} onChange={e => setSqft(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Listing Price</Label>
            <Input type="text" placeholder="$425,000" value={price} onChange={e => setPrice(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">Property Type</Label>
          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger className="h-11 min-h-[44px] text-sm">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Single-family home">Single-family home</SelectItem>
              <SelectItem value="Condo/Townhome">Condo / Townhome</SelectItem>
              <SelectItem value="Multi-family">Multi-family</SelectItem>
              <SelectItem value="Luxury estate">Luxury estate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Neighborhood / City</Label>
            <Input type="text" placeholder="Westlake" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Year Built</Label>
            <Input type="number" min={1800} max={2030} placeholder="2018" value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} className="h-11 min-h-[44px] text-sm" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">Key Features</Label>
          <Textarea
            placeholder="Open floor plan, quartz countertops, walk-in closet, covered patio..."
            rows={3}
            value={features}
            onChange={e => setFeatures(e.target.value)}
            className="text-sm min-h-[44px]"
          />
          <p className="text-[13px] text-muted-foreground">Separate with commas</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">Agent's Selling Angle <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            type="text"
            placeholder="Perfect starter home under $450K in top school district"
            value={angle}
            onChange={e => setAngle(e.target.value)}
            className="h-11 min-h-[44px] text-sm"
          />
        </div>

        {/* Writing Style Pills */}
        <div className="space-y-1.5">
          <Label className="text-[13px]">Writing Style</Label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            {STYLES.map(s => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={cn(
                  'shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors min-h-[40px]',
                  style === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || loading}
          className="w-full min-h-[44px] font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Descriptions'
          )}
        </Button>
      </div>

      {/* Results */}
      {resultCards.length > 0 && (
        <div className="space-y-3 animate-fade-in">
          {resultCards.map(card => (
            <Card key={card.label} className="bg-card border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">{card.label}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{wordCount(card.text)} words</span>
                  <CopyButton text={card.text} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{card.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
