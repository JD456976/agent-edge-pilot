import { Home, DoorOpen, RefreshCw, ClipboardList, GitBranch, Calendar, Settings, Shield, BarChart2, BookOpen, ShieldCheck } from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Home', workspace: 'home', icon: Home },
  { label: 'Open House', workspace: 'open-house', icon: DoorOpen },
  { label: 'CRM', workspace: 'work', icon: RefreshCw },
  { label: 'Deals', workspace: 'deals', icon: ClipboardList },
  { label: 'Sequences', workspace: 'sequences', icon: GitBranch },
  { label: 'Appointments', workspace: 'appointments', icon: Calendar },
  { label: 'Insights', workspace: 'insights', icon: BarChart2 },
  { label: 'Templates', workspace: 'message-templates', icon: BookOpen },
  { label: 'Settings', workspace: 'settings', icon: Settings },
  { label: 'Objection Coach', workspace: 'objection-coach', icon: Shield },
  { label: 'Admin', workspace: 'admin', icon: ShieldCheck },
] as const;
