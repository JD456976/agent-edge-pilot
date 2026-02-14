export type UserRole = 'admin' | 'agent' | 'reviewer' | 'beta';
export type DealStage = 'offer' | 'offer_accepted' | 'pending' | 'closed';
export type RiskLevel = 'green' | 'yellow' | 'red';
export type TaskType = 'call' | 'text' | 'email' | 'showing' | 'follow_up' | 'closing' | 'open_house' | 'thank_you';
export type AlertType = 'speed' | 'urgent' | 'risk' | 'opportunity';
export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface MilestoneStatus {
  inspection?: 'unknown' | 'scheduled' | 'complete';
  financing?: 'unknown' | 'preapproved' | 'approved';
  appraisal?: 'unknown' | 'ordered' | 'complete';
}

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
  createdAt?: string;
  lastActivityAt?: string;
  leadTemperature?: LeadTemperature;
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
  createdAt?: string;
  lastTouchedAt?: string;
  riskFlags?: string[];
  milestoneStatus?: MilestoneStatus;
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

/** Intelligence Engine scored output */
export interface ScoredEntity {
  entityId: string;
  entityType: 'lead' | 'deal' | 'task' | 'alert';
  urgencyScore: number;
  revenueImpactScore: number;
  decayRiskScore: number;
  opportunityScore: number;
  attentionGapScore: number;
  overallPriorityScore: number;
  explanation: string[];
}

export interface CommandCenterAction {
  id: string;
  title: string;
  reason: string;
  timeWindow: string;
  potentialValue?: number;
  overallScore: number;
  scores: ScoredEntity;
  relatedTaskId?: string;
  relatedLeadId?: string;
  relatedDealId?: string;
  isSuggested?: boolean;
  suggestedType?: TaskType;
}

export interface CommandCenterDealAtRisk {
  deal: Deal;
  scores: ScoredEntity;
  topReason: string;
}

export interface CommandCenterOpportunity {
  lead: Lead;
  scores: ScoredEntity;
  topReason: string;
}

export interface CommandCenterSpeedAlert {
  id: string;
  title: string;
  detail: string;
  type: AlertType | 'task_due';
  urgencyScore: number;
  scores: ScoredEntity;
  relatedLeadId?: string;
  relatedDealId?: string;
}

export interface CommandCenterPanels {
  priorityActions: CommandCenterAction[];
  dealsAtRisk: CommandCenterDealAtRisk[];
  opportunities: CommandCenterOpportunity[];
  speedAlerts: CommandCenterSpeedAlert[];
}
