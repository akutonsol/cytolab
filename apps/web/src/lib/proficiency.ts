// Shared types + display metadata for Proficiency Testing.

export type ProfTestType = 'Internal' | 'CAP' | 'CLIA' | 'External';
export type ProfTestStatus = 'Draft' | 'Active' | 'Grading' | 'Completed' | 'Archived';
export type CaseDifficulty = 'Easy' | 'Standard' | 'Difficult' | 'Expert';
export type ConfidenceLevel = 'Low' | 'Moderate' | 'High';

export interface ProfTest {
  id: string; name: string; description: string | null; testType: ProfTestType; status: ProfTestStatus;
  startDate: string; endDate: string; passingScore: number; createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
  caseCount: number; responderCount: number;
}

export interface ProfCase {
  id: string; caseNumber: number; specimenType: string; clinicalHistory: string | null; imageUrl: string | null;
  difficulty: CaseDifficulty; responseCount: number; expectedDiagnosis: string; expectedBethesda: string | null;
}

export interface ResponseSummaryRow {
  userId: string; name: string; casesCompleted: number; correctCount: number;
  percentage: number | null; graded: boolean; passed: boolean | null;
}

export interface TestDetail extends Omit<ProfTest, 'caseCount' | 'responderCount'> {
  totalCases: number; responderCount: number; cases: ProfCase[]; responseSummary: ResponseSummaryRow[]; expectedVisible: boolean;
}

export interface RespondCase { id: string; caseNumber: number; specimenType: string; clinicalHistory: string | null; imageUrl: string | null; difficulty: CaseDifficulty }
export interface MyResponse {
  test: { id: string; name: string; status: ProfTestStatus; passingScore: number };
  cases: RespondCase[];
  responses: { caseId: string; diagnosis: string; bethesdaAnswer: string | null; confidence: ConfidenceLevel; notes: string | null }[];
}

export interface ProfResults {
  testName: string; passingScore: number;
  cases: { caseId: string; caseNumber: number; specimenType: string; expected: string; responses: { responder: string; answer: string; isCorrect: boolean | null }[] }[];
  scores: { userId: string; name: string; correct: number; total: number; percentage: number; passed: boolean }[];
  labAverage: number; passRate: number;
}

export interface ProfAnalytics {
  totalTests: number; completedTests: number; labAverageScore: number; passingRate: number;
  byPathologist: { name: string; avgScore: number; testsCompleted: number }[];
  trendByQuarter: { quarter: string; avgScore: number }[];
}

// Badge palettes (zero orange). Difficult uses dark yellow #A16207 (not orange).
export const TYPE_META: Record<ProfTestType, { bg: string; fg: string }> = {
  CAP: { bg: '#EEF2FF', fg: '#4F46E5' },
  CLIA: { bg: '#EFF6FF', fg: '#2563EB' },
  Internal: { bg: '#F1F5F9', fg: '#475569' },
  External: { bg: '#F5F3FF', fg: '#7C3AED' },
};

export const STATUS_META: Record<ProfTestStatus, { label: string; bg: string; fg: string }> = {
  Draft: { label: 'Draft', bg: '#F1F5F9', fg: '#475569' },
  Active: { label: 'Active', bg: '#DBEAFE', fg: '#1D4ED8' },
  Grading: { label: 'Grading', bg: '#F5F3FF', fg: '#7C3AED' },
  Completed: { label: 'Completed', bg: '#DCFCE7', fg: '#16A34A' },
  Archived: { label: 'Archived', bg: '#F1F5F9', fg: '#475569' },
};

export const DIFFICULTY_META: Record<CaseDifficulty, { bg: string; fg: string }> = {
  Easy: { bg: '#DCFCE7', fg: '#16A34A' },
  Standard: { bg: '#F1F5F9', fg: '#475569' },
  Difficult: { bg: '#FEFCE8', fg: '#A16207' },
  Expert: { bg: '#FEE2E2', fg: '#B91C1C' },
};

export const TEST_TYPES: ProfTestType[] = ['Internal', 'CAP', 'CLIA', 'External'];
export const DIFFICULTIES: CaseDifficulty[] = ['Easy', 'Standard', 'Difficult', 'Expert'];
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['Low', 'Moderate', 'High'];

/** Score color: green at/above passing, red below. */
export const scoreColor = (pct: number, passing: number): string => (pct >= passing ? '#16A34A' : '#B91C1C');
export const passBadge = (passed: boolean) => (passed ? { bg: '#DCFCE7', fg: '#16A34A', label: 'Pass' } : { bg: '#FEE2E2', fg: '#B91C1C', label: 'Fail' });
export const shortDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
