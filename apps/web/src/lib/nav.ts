import {
  AppWindow,
  BarChart2,
  CreditCard,
  FileSearch,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  /** View-permission code required to see this item. Omitted = always visible to authed users. */
  permission?: string;
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
      { label: 'Patients', path: '/patients', permission: 'patient:view' },
      { label: 'Clients', path: '/clients', permission: 'client:view' },
      { label: 'Requisitions', path: '/requisitions', permission: 'requisition:view' },
      { label: 'Samples', path: '/records', permission: 'record:view' },
    ],
  },
  {
    key: 'results',
    label: 'Results',
    icon: FileSearch,
    items: [
      { label: 'Result Sheets', path: '/result-sheets', permission: 'resultsheet:view', phase: 3 },
      { label: 'Authorization', path: '/authorizer', permission: 'resultsheet:authorize', phase: 3 },
      { label: 'Code Sheets', path: '/code-sheets', permission: 'codesheet:view' },
      { label: 'Lab Codes', path: '/lab-codes', permission: 'labcode:view' },
      { label: 'Cabinets', path: '/cabinets', permission: 'cabinet:view', phase: 3 },
      { label: 'Reports', path: '/reports', permission: 'report:view', phase: 3 },
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
      { label: 'Taxes', path: '/taxes', permission: 'tax:view', phase: 4 },
    ],
  },
  {
    key: 'people',
    label: 'People',
    icon: Users,
    items: [
      { label: 'Employees', path: '/employees', permission: 'employee:view', phase: 7 },
      { label: 'Departments', path: '/departments', permission: 'department:view', phase: 7 },
      { label: 'Payroll', path: '/payroll', permission: 'payroll:view', phase: 7 },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    icon: AppWindow,
    items: [
      { label: 'Users', path: '/users', permission: 'user:view' },
      { label: 'Roles', path: '/roles', permission: 'role:view' },
      { label: 'Workspaces', path: '/workspaces', phase: 8 },
      { label: 'Messaging', path: '/messaging', permission: 'message:view', phase: 8 },
      { label: 'Client Requests', path: '/change-requests', permission: 'changerequest:view', icon: MessageSquare },
      { label: 'Notifications', path: '/notifications', permission: 'notification:view' },
      { label: 'Appointments', path: '/appointments', phase: 8 },
      { label: 'Search', path: '/search' },
      { label: 'Settings', path: '/settings', permission: 'applicationprefs:view' },
      { label: 'Form Setup', path: '/settings/forms', permission: 'formconfig:view' },
      { label: 'System Health', path: '/system', permission: 'system:health' },
      { label: 'Files', path: '/files', phase: 8 },
    ],
  },
];

// Standalone top-level links (their own blue-underlined nav items), not inside a
// dropdown group. Home is the landing page; Analytics the deep-dive.
export const HOME_ITEM: NavItem = { label: 'Home', path: '/dashboard', permission: 'record:view', icon: LayoutDashboard };
export const ANALYTICS_ITEM: NavItem = { label: 'Analytics', path: '/analytics', permission: 'applicationprefs:reports', icon: BarChart2 };

// Top-nav layout: which groups are center dropdowns vs. tucked into the account
// (avatar) menu. Everything stays reachable.
export const CENTER_GROUP_KEYS = ['lab', 'results', 'finance', 'people'];
export const ACCOUNT_GROUP_KEY = 'platform';

const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ANALYTICS_ITEM];
export const navItemByPath = (path: string): NavItem | undefined =>
  ALL_ITEMS.find((i) => i.path === path);
