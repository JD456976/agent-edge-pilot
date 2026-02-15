import type { UserLevel } from '@/hooks/useUserMaturity';
import type { PanelId } from '@/hooks/useCommandCenterLayout';

export interface MinimalModeAuditReport {
  beforePanelCount: number;
  afterPanelCount: number;
  panelReduction: number;
  panelReductionPct: number;
  estimatedCognitiveLoadBefore: number; // 0-100
  estimatedCognitiveLoadAfter: number;
  timeToFirstValueBefore: number; // seconds estimate
  timeToFirstValueAfter: number;
  decisionClarityBefore: number; // 0-100
  decisionClarityAfter: number;
  adoptionRiskBefore: number; // 0-100
  adoptionRiskAfter: number;
  panelCountDecreased: boolean;
  clarityIncreased: boolean;
  timeToValueUnder60s: boolean;
  adoptionRiskReduced: boolean;
  overallImproved: boolean;
}

const ALL_PANEL_COUNT = 25; // total panels in the system

// Cognitive load heuristic: more panels = more load
function cognitiveLoad(panelCount: number): number {
  return Math.min(100, Math.round((panelCount / ALL_PANEL_COUNT) * 100));
}

// Time to first value: fewer panels = faster orientation
function timeToFirstValue(panelCount: number): number {
  // Assume ~5s per visible panel for scanning, minimum 10s
  return Math.max(10, panelCount * 5);
}

// Decision clarity: inverse of panel count normalized
function decisionClarity(panelCount: number): number {
  if (panelCount <= 3) return 95;
  if (panelCount <= 5) return 85;
  if (panelCount <= 10) return 65;
  if (panelCount <= 15) return 45;
  return 25;
}

// Adoption risk: high panel count + new user = high risk
function adoptionRisk(panelCount: number, userLevel: UserLevel): number {
  const panelPenalty = Math.min(50, Math.round((panelCount / ALL_PANEL_COUNT) * 50));
  const levelBonus = userLevel * 12; // experienced users handle more
  return Math.max(0, Math.min(100, panelPenalty + (3 - userLevel) * 15 - levelBonus));
}

export function computeMinimalModeAudit(
  visiblePanelCount: number,
  userLevel: UserLevel,
): MinimalModeAuditReport {
  const beforeCount = ALL_PANEL_COUNT;
  const afterCount = visiblePanelCount;

  const report: MinimalModeAuditReport = {
    beforePanelCount: beforeCount,
    afterPanelCount: afterCount,
    panelReduction: beforeCount - afterCount,
    panelReductionPct: Math.round(((beforeCount - afterCount) / beforeCount) * 100),
    estimatedCognitiveLoadBefore: cognitiveLoad(beforeCount),
    estimatedCognitiveLoadAfter: cognitiveLoad(afterCount),
    timeToFirstValueBefore: timeToFirstValue(beforeCount),
    timeToFirstValueAfter: timeToFirstValue(afterCount),
    decisionClarityBefore: decisionClarity(beforeCount),
    decisionClarityAfter: decisionClarity(afterCount),
    adoptionRiskBefore: adoptionRisk(beforeCount, 0),
    adoptionRiskAfter: adoptionRisk(afterCount, userLevel),
    panelCountDecreased: afterCount < beforeCount,
    clarityIncreased: decisionClarity(afterCount) > decisionClarity(beforeCount),
    timeToValueUnder60s: timeToFirstValue(afterCount) < 60,
    adoptionRiskReduced: adoptionRisk(afterCount, userLevel) < adoptionRisk(beforeCount, 0),
    overallImproved: false,
  };

  report.overallImproved = report.panelCountDecreased && report.clarityIncreased && report.adoptionRiskReduced;

  return report;
}

export function logAuditReport(report: MinimalModeAuditReport): void {
  if (import.meta.env.DEV) {
    console.group('📊 Minimal Mode Impact Audit');
    console.table({
      'Panel Count': { Before: report.beforePanelCount, After: report.afterPanelCount, Change: `-${report.panelReductionPct}%` },
      'Cognitive Load': { Before: report.estimatedCognitiveLoadBefore, After: report.estimatedCognitiveLoadAfter, Change: `${report.estimatedCognitiveLoadAfter - report.estimatedCognitiveLoadBefore}` },
      'Time to Value (s)': { Before: report.timeToFirstValueBefore, After: report.timeToFirstValueAfter, Change: `${report.timeToFirstValueAfter - report.timeToFirstValueBefore}s` },
      'Decision Clarity': { Before: report.decisionClarityBefore, After: report.decisionClarityAfter, Change: `+${report.decisionClarityAfter - report.decisionClarityBefore}` },
      'Adoption Risk': { Before: report.adoptionRiskBefore, After: report.adoptionRiskAfter, Change: `${report.adoptionRiskAfter - report.adoptionRiskBefore}` },
    });
    console.log('✅ Checks:', {
      panelCountDecreased: report.panelCountDecreased,
      clarityIncreased: report.clarityIncreased,
      timeToValueUnder60s: report.timeToValueUnder60s,
      adoptionRiskReduced: report.adoptionRiskReduced,
      overallImproved: report.overallImproved,
    });
    console.groupEnd();
  }
}
