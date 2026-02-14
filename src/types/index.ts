export type UserRole = 'admin' | 'agent' | 'reviewer' | 'beta';
export type DealStage = 'offer' | 'offer_accepted' | 'pending' | 'closed';
export type RiskLevel = 'green' | 'yellow' | 'red';
export type TaskType = 'call' | 'text' | 'email' | 'showing' | 'follow_up' | 'closing' | 'open_house' | 'thank_you';
export type AlertType = 'speed' | 'urgent' | 'risk' | 'opportunity';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  themePreference: 'dark' | 'light';
  createdAt: string;
  lastLoginAt: string;
  isActive: boolean;
}

export interface Lead {
  id: string;
  name: string;
  source: string;
  lastContactAt: string;
  engagementScore: number;
  notes: string;
  statusTags: string[];
  assignedToUserId: string;
}

export interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  price: number;
  commission: number;
  closeDate: string;
  riskLevel: RiskLevel;
  assignedToUserId: string;
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  dueAt: string;
  relatedLeadId?: string;
  relatedDealId?: string;
  completedAt?: string;
  assignedToUserId: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  detail: string;
  expiresAt: string;
  relatedLeadId?: string;
  relatedDealId?: string;
}

export interface PriorityAction {
  id: string;
  title: string;
  reason: string;
  timeWindow: string;
  potentialValue?: number;
  score: number;
  relatedTaskId?: string;
  relatedLeadId?: string;
  relatedDealId?: string;
}
