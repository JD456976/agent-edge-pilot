import React, { useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Printer, MapPin, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { EmptyState } from '@/components/EmptyState';

export function OpenHouseQRCodes() {
  const { user } = useAuth();

  const { data: openHouses = [], isLoading } = useQuery({
    queryKey: ['open-houses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_houses')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getIntakeUrl = (token: string) => {
    // Use published URL for QR codes so visitors aren't prompted to log in.
    // Preview domains (*.lovableproject.com) require authentication;
    // the published domain is publicly accessible.
    const origin = window.location.origin;
    const isPreview = origin.includes('.lovableproject.com') || origin.includes('-preview--');
    const base = isPreview ? 'https://deal-pilot-cr.lovable.app' : origin;
    return `${base}/visit/${token}`;
  };

  const downloadQR = useCallback((token: string, address: string) => {
    const svg = document.getElementById(`qr-${token}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);
      const a = document.createElement('a');
      a.download = `qr-${address.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }, []);

  const printFlyer = useCallback((oh: any) => {
    const url = getIntakeUrl(oh.intake_token);

    // Render the QR SVG to a data URL first
    const svgEl = document.getElementById(`qr-${oh.intake_token}`);
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const qrDataUrl = canvas.toDataURL('image/png');

      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Open House Sign-In</title>
          <style>
            @page { size: letter; margin: 0.5in; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 40px; color: #1a1a1a; }
            .header { font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #666; margin-bottom: 24px; }
            .address { font-size: 28px; font-weight: 700; margin-bottom: 32px; line-height: 1.3; }
            .qr-container { display: inline-block; padding: 24px; border: 3px solid #e0e0e0; border-radius: 16px; margin-bottom: 32px; }
            .scan-text { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
            .scan-sub { font-size: 14px; color: #666; margin-bottom: 40px; }
            .agent-info { border-top: 2px solid #e0e0e0; padding-top: 24px; margin-top: 20px; }
            .agent-name { font-size: 20px; font-weight: 600; }
            .agent-detail { font-size: 14px; color: #666; margin-top: 4px; }
            .brokerage { font-size: 12px; color: #999; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">Welcome to Our Open House</div>
          <div class="address">${oh.property_address}</div>
          <div class="qr-container">
            <img src="${qrDataUrl}" width="250" height="250" />
          </div>
          <div class="scan-text">📱 Scan to Sign In</div>
          <div class="scan-sub">Receive updates on similar homes in your area</div>
          ${oh.agent_name || user?.name ? `
          <div class="agent-info">
            <div class="agent-name">${oh.agent_name || user?.name || ''}</div>
            ${oh.agent_phone ? `<div class="agent-detail">${oh.agent_phone}</div>` : ''}
            ${oh.agent_email || user?.email ? `<div class="agent-detail">${oh.agent_email || user?.email}</div>` : ''}
            ${oh.brokerage ? `<div class="brokerage">${oh.brokerage}</div>` : ''}
          </div>` : ''}
        </body>
        </html>
      `);
      win.document.close();
      setTimeout(() => win.print(), 500);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [user]);

  if (isLoading) return <div className="h-40 bg-muted/50 rounded-lg animate-pulse" />;

  if (openHouses.length === 0) {
    return <EmptyState title="No Active Open Houses" description="Create an open house first to generate QR codes." icon={<QrCode className="h-8 w-8" />} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {openHouses.map(oh => (
        <Card key={oh.id} className="border-border/50">
          <CardContent className="p-4 text-center space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="truncate">{oh.property_address}</span>
            </div>

            <div className="flex justify-center">
              <QRCodeSVG
                id={`qr-${oh.intake_token}`}
                value={getIntakeUrl(oh.intake_token)}
                size={180}
                level="H"
                includeMargin
                bgColor="transparent"
                fgColor="currentColor"
                className="text-foreground"
              />
            </div>

            <p className="text-[10px] text-muted-foreground break-all">{getIntakeUrl(oh.intake_token)}</p>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => downloadQR(oh.intake_token, oh.property_address)}>
                <Download className="h-3.5 w-3.5 mr-1" /> PNG
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => printFlyer(oh)}>
                <Printer className="h-3.5 w-3.5 mr-1" /> Flyer
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
