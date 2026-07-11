import {
  Activity,
  AlertTriangle,
  AppWindow,
  Award,
  Ban,
  BarChart2,
  BarChart3,
  BellRing,
  Book,
  Brain,
  History,
  KeyRound,
  KeySquare,
  Lock,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCheck,
  Timer,
  CheckSquare,
  Clock,
  FileClock,
  FileBarChart,
  CreditCard,
  GitMerge,
  FileSearch,
  FlaskConical,
  GraduationCap,
  Headset,
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  ScanEye,
  ScanLine,
  ScatterChart,
  Share2,
  Tag,
  ToggleRight,
  Users,
  Users2,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey } from './features';

export interface NavItem {
  label: string;
  path: string;
  /** View-permission code required to see this item. Omitted = always visible to authed users. */
  permission?: string;
  /** If set, the item is hidden unless this feature flag is enabled for the lab. */
  feature?: FeatureKey;
  /** If set, the page is a placeholder for the given build phase. */
  phase?: number;
  /** Optional Lucide icon (used by standalone hero-nav pills like Home/Analytics). */
  icon?: LucideIcon;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'lab',
    label: 'Lab',
    icon: FlaskConical,
    items: [
      { label: 'Operations', path: '/operations', permission: 'record:view', icon: Activity },
      { label: 'Patients', path: '/patients', permission: 'patient:view' },
      { label: 'Clients', path: '/clients', permission: 'client:view' },
      { label: 'Requisitions', path: '/requisitions', permission: 'requisition:view' },
      { label: 'Samples', path: '/records', permission: 'record:view' },
      { label: 'Workload', path: '/workload', permission: 'record:view', feature: 'CASE_ASSIGNMENT', icon: Users2 },
      { label: 'Quality Control', path: '/qc', permission: 'record:view', feature: 'QC_MODULE', icon: CheckSquare },
      { label: 'Equipment', path: '/qc/equipment', permission: 'record:view', feature: 'QC_MODULE', icon: Wrench },
      { label: 'Req Tracking', path: '/req-tracking', permission: 'requisition:view', feature: 'REQUISITION_TRACKING', icon: ScanLine },
      { label: 'Reagents', path: '/reagents', permission: 'record:view', feature: 'REAGENT_TRACKING', icon: FlaskConical },
      { label: 'Digital Slides', path: '/wsi', permission: 'record:view', feature: 'WSI_VIEWER', icon: ScanEye },
      { label: 'FHIR', path: '/fhir', permission: 'record:view', feature: 'HL7_FHIR', icon: Share2 },
    ],
  },
  {
    key: 'results',
    label: 'Results',
    icon: FileSearch,
    items: [
      { label: 'Result Sheets', path: '/result-sheets', permission: 'resultsheet:view', phase: 3 },
      { label: 'Authorization', path: '/authorizer', permission: 'resultsheet:authorize', phase: 3 },
      { label: 'Batch Auth', path: '/batch-authorize', permission: 'resultsheet:authorize', feature: 'BATCH_AUTHORIZATION', icon: CheckCheck },
      { label: 'Result Templates', path: '/result-templates', permission: 'resultentry:view', feature: 'RESULT_TEMPLATES' },
      { label: 'TAT Alerts', path: '/tat', permission: 'record:view', feature: 'TAT_ALERTS' },
      { label: 'Escalations', path: '/escalations', permission: 'record:view', feature: 'ABNORMAL_ESCALATION', icon: AlertTriangle },
      { label: 'Bethesda Analytics', path: '/bethesda-analytics', permission: 'resultentry:view', feature: 'BETHESDA_ANALYTICS', icon: BarChart2 },
      { label: 'Correlation', path: '/correlation', permission: 'record:view', feature: 'CORRELATION_TRACKING', icon: GitMerge },
      { label: 'Proficiency', path: '/proficiency', permission: 'record:view', feature: 'PROFICIENCY_TESTING', icon: GraduationCap },
      { label: 'Recalls', path: '/recalls', permission: 'record:view', feature: 'PATIENT_RECALL', icon: CalendarClock },
      { label: 'AI Screening', path: '/ai-screening', permission: 'record:view', feature: 'AI_SCREENING', icon: Brain },
      { label: 'Teleconsult', path: '/teleconsult', permission: 'record:view', feature: 'TELECONSULTATION', icon: Video },
      { label: 'Coding', path: '/coding', permission: 'record:view', feature: 'LOINC_SNOMED', icon: Tag },
      { label: 'Report Center', path: '/report-center', permission: 'report:view', feature: 'REPORT_CENTER', icon: FileBarChart },
      { label: 'Code Vault', path: '/lab-codes', permission: 'labcode:view' },
      { label: 'Cabinets', path: '/cabinets', permission: 'cabinet:view', phase: 3 },
      { label: 'Specimen Reports', path: '/reports', permission: 'report:view', phase: 3 },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: CreditCard,
    items: [
      { label: 'Billing', path: '/billing', permission: 'bill:view', phase: 4 },
      { label: 'Payments', path: '/payments', permission: 'payment:view', phase: 4 },
      { label: 'Services', path: '/services', permission: 'service:view', phase: 4 },
    ],
  },
  {
    key: 'people',
    label: 'People',
    icon: Users,
    items: [
      { label: 'Employees', path: '/employees', permission: 'employee:view' },
      { label: 'Departments', path: '/departments', permission: 'department:view' },
      { label: 'Payroll', path: '/payroll', permission: 'payroll:view' },
    ],
  },
  {
    key: 'workforce',
    label: 'Workforce',
    icon: CalendarClock,
    // Every item is gated on WORKFORCE_MANAGEMENT, so when the feature is off the
    // group has no visible items and NavPills drops the pill entirely.
    items: [
      { label: 'Attendance', path: '/workforce', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: Clock },
      { label: 'Timesheets', path: '/workforce/timesheets', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: FileClock },
      { label: 'Scheduling', path: '/workforce/schedule', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: CalendarDays },
      { label: 'Leave', path: '/workforce/leave', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: CalendarOff },
      { label: 'Overtime', path: '/workforce/overtime', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: Timer },
      { label: 'Reports', path: '/workforce/reports', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: BarChart3 },
      { label: 'Productivity', path: '/workforce/productivity', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: ScatterChart },
      { label: 'Performance', path: '/workforce/performance', permission: 'record:view', feature: 'WORKFORCE_MANAGEMENT', icon: Award },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    icon: Book,
    items: [
      // No permission/feature — the knowledge base is open to every authed user.
      { label: 'Knowledge Base', path: '/knowledge-base', icon: Book },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    icon: AppWindow,
    items: [
      { label: 'Users', path: '/users', permission: 'user:view' },
      { label: 'Roles', path: '/roles', permission: 'role:view' },
      { label: 'Workspaces', path: '/workspaces', permission: 'workspace:view' },
      { label: 'Messaging', path: '/messaging', permission: 'message:view', phase: 8 },
      { label: 'Client Requests', path: '/change-requests', permission: 'changerequest:view', icon: MessageSquare },
      { label: 'Notifications', path: '/notifications', permission: 'notification:view' },
      { label: 'Appointments', path: '/appointments', permission: 'record:view', feature: 'APPOINTMENTS', icon: CalendarDays },
      { label: 'Search', path: '/search' },
      { label: 'Settings', path: '/settings', permission: 'applicationprefs:view' },
      { label: 'Form Setup', path: '/settings/forms', permission: 'formconfig:view' },
      { label: 'Modules', path: '/settings/features', permission: 'system:health', icon: Puzzle },
      { label: 'System Health', path: '/system', permission: 'system:health' },
      { label: 'System Log', path: '/system/logs', permission: 'system:health' },
      { label: 'Support', path: '/system/support', permission: 'system:health', icon: Headset },
      { label: 'Files', path: '/files', permission: 'record:view' },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    icon: ShieldCheck,
    // Security Center — gated on 'system:security', held by no default role, so
    // only superusers/admins reach it (super roles bypass the permission guard).
    items: [
      { label: 'Security Dashboard', path: '/security', permission: 'system:security', icon: ShieldCheck },
      { label: 'Active Sessions', path: '/security/sessions', permission: 'system:security', icon: MonitorSmartphone },
      { label: 'Login History', path: '/security/login-history', permission: 'system:security', icon: History },
      { label: 'Locked Accounts', path: '/security/locked-users', permission: 'system:security', icon: Lock },
      { label: 'Blocked IPs', path: '/security/blocked-ips', permission: 'system:security', icon: Ban },
      { label: 'Trusted Devices', path: '/security/trusted-devices', permission: 'system:security', icon: Smartphone },
      { label: 'MFA Management', path: '/security/mfa', permission: 'system:security', icon: KeyRound },
      { label: 'Security Alerts', path: '/security/alerts', permission: 'system:security', icon: BellRing },
      { label: 'Password Policy', path: '/security/password-policy', permission: 'system:security', icon: KeySquare },
    ],
  },
  {
    key: 'superuser',
    label: 'Superuser',
    icon: ToggleRight,
    // Superuser-only: no default role holds 'system:health', so only superusers
    // (who bypass permission checks) ever see this section.
    items: [
      { label: 'Features', path: '/superuser/features', permission: 'system:health', icon: ToggleRight },
    ],
  },
];

// Standalone top-level links (their own blue-underlined nav items), not inside a
// dropdown group. Home is the landing page; Analytics the deep-dive.
export const HOME_ITEM: NavItem = { label: 'Home', path: '/dashboard', permission: 'record:view', icon: LayoutDashboard };
export const ANALYTICS_ITEM: NavItem = { label: 'Analytics', path: '/analytics', permission: 'applicationprefs:reports', icon: BarChart2 };

// Top-nav layout: which groups are center dropdowns vs. tucked into the account
// (avatar) menu. Everything stays reachable.
export const CENTER_GROUP_KEYS = ['lab', 'results', 'finance', 'people', 'workforce', 'resources'];
export const ACCOUNT_GROUP_KEY = 'platform';

const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ANALYTICS_ITEM];
export const navItemByPath = (path: string): NavItem | undefined =>
  ALL_ITEMS.find((i) => i.path === path);
