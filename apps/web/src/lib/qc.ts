// Shared types + display metadata for the Quality Control module.

export type QCResult = 'Pass' | 'Fail' | 'Marginal';
export type QCCheckType =
  | 'SlidePreparation' | 'StainingQuality' | 'FixationAdequacy' | 'CellularityCheck'
  | 'EquipmentCalibration' | 'ReagentCheck' | 'ExternalQC';
export type EquipmentType = 'Stainer' | 'Centrifuge' | 'Microscope' | 'Processor' | 'Scanner' | 'Other';
export type AlertStatus = 'Open' | 'Acknowledged' | 'Resolved';

export interface QCCheck {
  id: string;
  checkType: QCCheckType;
  result: QCResult;
  batchId: string | null;
  notes: string | null;
  failureReason: string | null;
  correctiveAction: string | null;
  performedAt: string;
  createdAt: string;
  recordId: string | null;
  equipmentId: string | null;
  performedBy: { id: string; firstName: string; lastName: string } | null;
  equipment: { id: string; name: string; type: EquipmentType } | null;
  record: { id: string; labNumber: string | null; identifier: string } | null;
}

export interface QCAlert {
  id: string;
  status: AlertStatus;
  createdAt: string;
  resolvedAt: string | null;
  qcCheck: QCCheck;
}

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  serialNumber: string | null;
  lastServiceDate: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { qcChecks: number };
}

export interface QCStats {
  totalChecks: number;
  passRate: number;
  failRate: number;
  marginalRate: number;
  passCount: number;
  failCount: number;
  marginalCount: number;
  failsByType: { type: QCCheckType; count: number }[];
  failsByEquipment: { equipmentName: string; count: number }[];
  failsByTechnician: { userName: string; count: number }[];
  trendByDay: { date: string; pass: number; fail: number; marginal: number }[];
}

// Result badge palette. Detector-safe: Marginal uses dark yellow #A16207 (not
// orange). Zero orange.
export const RESULT_META: Record<QCResult, { label: string; bg: string; fg: string }> = {
  Pass: { label: 'Pass', bg: '#DCFCE7', fg: '#15803D' },
  Fail: { label: 'Fail', bg: '#FEE2E2', fg: '#B91C1C' },
  Marginal: { label: 'Marginal', bg: '#FEFCE8', fg: '#A16207' },
};

export const CHECK_TYPES: QCCheckType[] = [
  'SlidePreparation', 'StainingQuality', 'FixationAdequacy', 'CellularityCheck',
  'EquipmentCalibration', 'ReagentCheck', 'ExternalQC',
];
export const EQUIPMENT_TYPES: EquipmentType[] = ['Stainer', 'Centrifuge', 'Microscope', 'Processor', 'Scanner', 'Other'];

const LABELS: Record<string, string> = {
  SlidePreparation: 'Slide Preparation', StainingQuality: 'Staining Quality', FixationAdequacy: 'Fixation Adequacy',
  CellularityCheck: 'Cellularity Check', EquipmentCalibration: 'Equipment Calibration', ReagentCheck: 'Reagent Check',
  ExternalQC: 'External QC',
};
export const checkTypeLabel = (t: string): string => LABELS[t] ?? t;
