// Demo dataset for the interactive product experience (/experience).
//
// Self-contained, realistic cytopathology fixtures — Bethesda-accurate findings,
// deidentified patients, varied specimen types, TAT, and audit trails. NOT wired
// to the live API or DB (so the booth/landing experience never depends on login).
// Values are modeled on the seeded demo cases (DM26-series lab numbers, Bethesda
// distributions) to feel lived-in.

export type Finding = 'NILM' | 'ASC-US' | 'LSIL' | 'HSIL';

export type Detection = {
  id: string;
  x: number; y: number; w: number; h: number; // % within the slide viewport
  label: string;        // e.g. 'HSIL', 'Atypical'
  confidence: number;   // 0–100
  note: string;         // short morphology note shown on click
  severity: 'high' | 'moderate' | 'low' | 'benign';
};

export type ReportSection = { label: string; value: string };

export type AuditEntry = { t: string; actor: string; action: string };

export type DemoCase = {
  id: string;
  accession: string;
  patientLabel: string;   // deidentified
  age: number; sex: 'F' | 'M';
  specimenType: string;
  specimenShort: string;
  slide: string;          // public image
  collectedAt: string;
  receivedAt: string;
  priority: 'Routine' | 'Priority' | 'STAT';
  finding: Finding;
  findingLabel: string;
  bethesda: string;
  aiConfidence: number;
  cellsAnalyzed: number;
  atypicalCount: number;
  heatmap: number;        // 0–1 intensity of the risk heat overlay
  tatHours: number;
  autoSigned: boolean;    // NILM-type auto-signed by workflow rules
  pathologist: { name: string; initials: string };
  detections: Detection[];
  report: ReportSection[];
  recommendation: string;
  audit: AuditEntry[];
  accent: string;         // finding color
};

const RED = '#E63946';
const AMBER = '#8b5cf6'; // NOTE: intentionally violet, not amber (zero-orange rule)
const ROSE = '#fb7185';
const GREEN = '#10B981';

export const CASES: DemoCase[] = [
  {
    id: 'hsil',
    accession: 'DM26-07-912',
    patientLabel: 'Patient 4471 · R.M.',
    age: 42, sex: 'F',
    specimenType: 'ThinPrep Pap · Cervical',
    specimenShort: 'ThinPrep Pap',
    slide: '/cytology-sample.png',
    collectedAt: 'Jul 6, 2026 · 08:14',
    receivedAt: 'Jul 6, 2026 · 10:21',
    priority: 'Priority',
    finding: 'HSIL',
    findingLabel: 'High-grade squamous intraepithelial lesion',
    bethesda: 'Epithelial cell abnormality — HSIL',
    aiConfidence: 98.4,
    cellsAnalyzed: 61840,
    atypicalCount: 18,
    heatmap: 0.95,
    tatHours: 2.1,
    autoSigned: false,
    pathologist: { name: 'Dr. Sarah Mitchell', initials: 'SM' },
    accent: RED,
    detections: [
      { id: 'd1', x: 20, y: 18, w: 15, h: 20, label: 'HSIL', confidence: 98.4, note: 'High N:C ratio, hyperchromatic nuclei, irregular membrane.', severity: 'high' },
      { id: 'd2', x: 55, y: 33, w: 13, h: 18, label: 'HSIL', confidence: 96.1, note: 'Coarse chromatin, nuclear enlargement, scant cytoplasm.', severity: 'high' },
      { id: 'd3', x: 30, y: 58, w: 14, h: 19, label: 'Atypical', confidence: 88.7, note: 'Nuclear membrane irregularity; favor high-grade.', severity: 'moderate' },
      { id: 'd4', x: 62, y: 60, w: 11, h: 15, label: 'HSIL', confidence: 94.3, note: 'Marked pleomorphism, dense chromatin.', severity: 'high' },
      { id: 'd5', x: 44, y: 44, w: 9, h: 12, label: 'Atypical', confidence: 82.0, note: 'Enlarged nucleus, indistinct nucleolus.', severity: 'moderate' },
    ],
    report: [
      { label: 'Specimen', value: 'ThinPrep Pap test, cervical' },
      { label: 'Clinical history', value: '42F, routine screening, prior ASC-US (2024)' },
      { label: 'Specimen adequacy', value: 'Satisfactory for evaluation; endocervical/transformation zone component present' },
      { label: 'Interpretation', value: 'High-grade squamous intraepithelial lesion (HSIL)' },
      { label: 'Bethesda category', value: 'Epithelial cell abnormality — squamous' },
    ],
    recommendation: 'Colposcopy recommended per ASCCP guidelines. Reflex HPV genotyping performed.',
    audit: [
      { t: '10:21:04', actor: 'System', action: 'Specimen accessioned · DM26-07-912' },
      { t: '10:22:37', actor: 'Scanner-02', action: 'Whole-slide image captured (40×)' },
      { t: '10:23:11', actor: 'CYTOLAB AI v3.2', action: 'Screening complete · 61,840 cells · HSIL 98.4%' },
      { t: '10:31:52', actor: 'Dr. Sarah Mitchell', action: 'Findings reviewed · concurred with AI' },
      { t: '10:44:09', actor: 'CYTOLAB AI v3.2', action: 'Draft report generated' },
      { t: '10:45:20', actor: 'Dr. Sarah Mitchell', action: 'Report electronically signed' },
      { t: '10:45:23', actor: 'Integration', action: 'Result delivered to LIS (HL7 ORU^R01)' },
    ],
  },
  {
    id: 'lsil',
    accession: 'DM26-07-908',
    patientLabel: 'Patient 4468 · T.A.',
    age: 29, sex: 'F',
    specimenType: 'ThinPrep Pap · Cervical',
    specimenShort: 'ThinPrep Pap',
    slide: '/cytology-sample.png',
    collectedAt: 'Jul 6, 2026 · 07:52',
    receivedAt: 'Jul 6, 2026 · 09:40',
    priority: 'Routine',
    finding: 'LSIL',
    findingLabel: 'Low-grade squamous intraepithelial lesion',
    bethesda: 'Epithelial cell abnormality — LSIL',
    aiConfidence: 93.6,
    cellsAnalyzed: 54210,
    atypicalCount: 11,
    heatmap: 0.66,
    tatHours: 2.8,
    autoSigned: false,
    pathologist: { name: 'Dr. Sarah Mitchell', initials: 'SM' },
    accent: ROSE,
    detections: [
      { id: 'd1', x: 24, y: 26, w: 14, h: 18, label: 'LSIL', confidence: 93.6, note: 'Koilocytic change, mild nuclear enlargement.', severity: 'moderate' },
      { id: 'd2', x: 58, y: 40, w: 12, h: 16, label: 'LSIL', confidence: 90.2, note: 'Perinuclear halo, binucleation.', severity: 'moderate' },
      { id: 'd3', x: 40, y: 62, w: 11, h: 14, label: 'Atypical', confidence: 78.4, note: 'Mild nuclear hyperchromasia.', severity: 'low' },
    ],
    report: [
      { label: 'Specimen', value: 'ThinPrep Pap test, cervical' },
      { label: 'Clinical history', value: '29F, routine screening' },
      { label: 'Specimen adequacy', value: 'Satisfactory for evaluation' },
      { label: 'Interpretation', value: 'Low-grade squamous intraepithelial lesion (LSIL)' },
      { label: 'Bethesda category', value: 'Epithelial cell abnormality — squamous' },
    ],
    recommendation: 'Repeat cytology in 12 months or HPV testing per age-based guidelines.',
    audit: [
      { t: '09:40:12', actor: 'System', action: 'Specimen accessioned · DM26-07-908' },
      { t: '09:41:48', actor: 'Scanner-01', action: 'Whole-slide image captured (40×)' },
      { t: '09:42:20', actor: 'CYTOLAB AI v3.2', action: 'Screening complete · 54,210 cells · LSIL 93.6%' },
      { t: '11:02:31', actor: 'Dr. Sarah Mitchell', action: 'Findings reviewed · concurred with AI' },
      { t: '11:14:55', actor: 'Dr. Sarah Mitchell', action: 'Report electronically signed' },
      { t: '11:14:58', actor: 'Integration', action: 'Result delivered to LIS (HL7 ORU^R01)' },
    ],
  },
  {
    id: 'ascus',
    accession: 'DM26-07-906',
    patientLabel: 'Patient 4463 · J.K.',
    age: 35, sex: 'F',
    specimenType: 'ThinPrep Pap · Cervical',
    specimenShort: 'ThinPrep Pap',
    slide: '/cytology-sample.png',
    collectedAt: 'Jul 6, 2026 · 07:31',
    receivedAt: 'Jul 6, 2026 · 09:12',
    priority: 'Routine',
    finding: 'ASC-US',
    findingLabel: 'Atypical squamous cells of undetermined significance',
    bethesda: 'Epithelial cell abnormality — ASC-US',
    aiConfidence: 84.9,
    cellsAnalyzed: 49870,
    atypicalCount: 6,
    heatmap: 0.42,
    tatHours: 3.4,
    autoSigned: false,
    pathologist: { name: 'Dr. David Chen', initials: 'DC' },
    accent: AMBER,
    detections: [
      { id: 'd1', x: 33, y: 30, w: 12, h: 15, label: 'Atypical', confidence: 84.9, note: 'Nuclear enlargement ~2.5×, borderline.', severity: 'low' },
      { id: 'd2', x: 56, y: 52, w: 10, h: 13, label: 'Atypical', confidence: 79.1, note: 'Mild hyperchromasia; cannot exclude LSIL.', severity: 'low' },
    ],
    report: [
      { label: 'Specimen', value: 'ThinPrep Pap test, cervical' },
      { label: 'Clinical history', value: '35F, routine screening' },
      { label: 'Specimen adequacy', value: 'Satisfactory for evaluation' },
      { label: 'Interpretation', value: 'Atypical squamous cells of undetermined significance (ASC-US)' },
      { label: 'Bethesda category', value: 'Epithelial cell abnormality — squamous' },
    ],
    recommendation: 'Reflex HPV testing recommended; if positive, colposcopy.',
    audit: [
      { t: '09:12:03', actor: 'System', action: 'Specimen accessioned · DM26-07-906' },
      { t: '09:13:40', actor: 'Scanner-01', action: 'Whole-slide image captured (40×)' },
      { t: '09:14:07', actor: 'CYTOLAB AI v3.2', action: 'Screening complete · 49,870 cells · ASC-US 84.9%' },
      { t: '12:20:14', actor: 'Dr. David Chen', action: 'Findings reviewed · reflex HPV ordered' },
      { t: '12:33:41', actor: 'Dr. David Chen', action: 'Report electronically signed' },
      { t: '12:33:44', actor: 'Integration', action: 'Result delivered to LIS (HL7 ORU^R01)' },
    ],
  },
  {
    id: 'nilm',
    accession: 'DM26-07-901',
    patientLabel: 'Patient 4455 · L.P.',
    age: 51, sex: 'F',
    specimenType: 'Non-gyn · Pleural fluid',
    specimenShort: 'Pleural fluid',
    slide: '/cytology-nongyn.png',
    collectedAt: 'Jul 6, 2026 · 06:58',
    receivedAt: 'Jul 6, 2026 · 08:40',
    priority: 'Routine',
    finding: 'NILM',
    findingLabel: 'Negative for intraepithelial lesion or malignancy',
    bethesda: 'NILM — no malignant cells identified',
    aiConfidence: 99.2,
    cellsAnalyzed: 38460,
    atypicalCount: 0,
    heatmap: 0.08,
    tatHours: 1.6,
    autoSigned: true,
    pathologist: { name: 'Auto-signed · workflow rule', initials: 'AI' },
    accent: GREEN,
    detections: [
      { id: 'd1', x: 40, y: 38, w: 12, h: 15, label: 'Benign', confidence: 99.2, note: 'Reactive mesothelial cells, benign.', severity: 'benign' },
      { id: 'd2', x: 60, y: 55, w: 10, h: 12, label: 'Benign', confidence: 98.6, note: 'Bland chromatin, low N:C ratio.', severity: 'benign' },
    ],
    report: [
      { label: 'Specimen', value: 'Pleural fluid, left' },
      { label: 'Clinical history', value: '51F, pleural effusion, rule out malignancy' },
      { label: 'Specimen adequacy', value: 'Satisfactory for evaluation' },
      { label: 'Interpretation', value: 'Negative for malignancy (NILM)' },
      { label: 'Bethesda category', value: 'No malignant cells identified' },
    ],
    recommendation: 'No malignant cells identified. Clinical correlation recommended.',
    audit: [
      { t: '08:40:09', actor: 'System', action: 'Specimen accessioned · DM26-07-901' },
      { t: '08:41:33', actor: 'Scanner-02', action: 'Whole-slide image captured (40×)' },
      { t: '08:42:01', actor: 'CYTOLAB AI v3.2', action: 'Screening complete · 38,460 cells · NILM 99.2%' },
      { t: '08:42:05', actor: 'Workflow rule R-07', action: 'NILM + confidence ≥ 99% → auto-sign eligible' },
      { t: '08:42:06', actor: 'CYTOLAB', action: 'Report auto-signed and delivered to LIS' },
    ],
  },
];

// ── The 8 workflow stages ──────────────────────────────────────────────────
export type StageId =
  | 'received' | 'scanned' | 'analyzing' | 'detected'
  | 'review' | 'draft' | 'signed' | 'delivered';

export type Stage = {
  id: StageId;
  n: number;
  title: string;
  short: string;
  caption: string; // guided-demo narration
};

export const STAGES: Stage[] = [
  { id: 'received', n: 1, title: 'Specimen Arrives', short: 'Received', caption: 'A specimen is accessioned and enters the workflow — barcoded and tracked from the first second.' },
  { id: 'scanned', n: 2, title: 'Slide Scanned', short: 'Scanned', caption: 'The glass slide is digitized into a whole-slide image at 40× magnification.' },
  { id: 'analyzing', n: 3, title: 'AI Analysis Begins', short: 'AI Analysis', caption: 'CYTOLAB AI screens tens of thousands of cells in seconds, building a risk heat map.' },
  { id: 'detected', n: 4, title: 'Abnormal Cells Detected', short: 'Detection', caption: 'The model flags regions of interest with per-cell confidence — click any detection to inspect it.' },
  { id: 'review', n: 5, title: 'Pathologist Reviews', short: 'Review', caption: 'A pathologist validates the AI findings with full context — the human stays in control.' },
  { id: 'draft', n: 6, title: 'AI Generates Draft Report', short: 'Draft Report', caption: 'A structured, Bethesda-compliant report is drafted automatically from the confirmed findings.' },
  { id: 'signed', n: 7, title: 'Pathologist Signs', short: 'Sign-out', caption: 'The pathologist signs out — or low-risk cases auto-sign by workflow rule.' },
  { id: 'delivered', n: 8, title: 'Report Delivered', short: 'Delivered', caption: 'The signed report is delivered to the LIS/EHR and the audit trail is sealed.' },
];

export const severityColor: Record<Detection['severity'], string> = {
  high: RED, moderate: ROSE, low: AMBER, benign: GREEN,
};
