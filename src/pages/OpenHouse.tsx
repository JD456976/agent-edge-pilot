import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, Plus, QrCode, Users, TrendingUp } from 'lucide-react';
import { MyOpenHouses } from '@/components/openhouse/MyOpenHouses';
import { CreateOpenHouse } from '@/components/openhouse/CreateOpenHouse';
import { OpenHouseQRCodes } from '@/components/openhouse/OpenHouseQRCodes';
import { CapturedVisitors } from '@/components/openhouse/CapturedVisitors';
import { OpenHouseInsights } from '@/components/openhouse/OpenHouseInsights';

export default function OpenHouse() {
  const [activeTab, setActiveTab] = useState('my-open-houses');
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreated = (id: string) => {
    setActiveTab('qr-codes');
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setActiveTab('create');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          Open House Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Capture visitors, detect duplicates, and follow up intelligently.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-10">
          <TabsTrigger value="my-open-houses" className="text-xs gap-1">
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">My Open Houses</span>
            <span className="sm:hidden">Houses</span>
          </TabsTrigger>
          <TabsTrigger value="create" className="text-xs gap-1">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Create</span>
            <span className="sm:hidden">New</span>
          </TabsTrigger>
          <TabsTrigger value="qr-codes" className="text-xs gap-1">
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">QR & Materials</span>
            <span className="sm:hidden">QR</span>
          </TabsTrigger>
          <TabsTrigger value="visitors" className="text-xs gap-1">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Visitors</span>
            <span className="sm:hidden">Visitors</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Insights</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-open-houses" className="mt-4">
          <MyOpenHouses onEdit={handleEdit} onViewQR={(id) => { setActiveTab('qr-codes'); }} />
        </TabsContent>
        <TabsContent value="create" className="mt-4">
          <CreateOpenHouse onCreated={handleCreated} editingId={editingId} onClearEdit={() => setEditingId(null)} />
        </TabsContent>
        <TabsContent value="qr-codes" className="mt-4">
          <OpenHouseQRCodes />
        </TabsContent>
        <TabsContent value="visitors" className="mt-4">
          <CapturedVisitors />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <OpenHouseInsights />
        </TabsContent>
      </Tabs>
    </div>
  );
}
