import type { ComponentType } from 'react';
import {
  ExperimentOutlined,
  FileSearchOutlined,
  DollarOutlined,
  TeamOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

export interface NavItem {
  label: string;
  path: string;
  /** View-permission code required to see this item. Omitted = always visible to authed users. */
  permission?: string;
  /** If set, the page is a placeholder for the given build phase. */
  phase?: number;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: ComponentType;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'lab',
    label: 'Lab',
    icon: ExperimentOutlined,
    items: [
      { label: 'Patients', path: '/patients', permission: 'patient:view' },
      { label: 'Clients', path: '/clients', permission: 'client:view' },
      { label: 'Requisitions', path: '/requisitions', permission: 'requisition:view' },
      { label: 'Records', path: '/records', permission: 'record:view' },
    ],
  },
  {
    key: 'results',
    label: 'Results',
    icon: FileSearchOutlined,
    items: [
      { label: 'Result Sheets', path: '/result-sheets', permission: 'resultsheet:view', phase: 3 },
      { label: 'Authorization', path: '/authorizer', permission: 'resultsheet:authorize', phase: 3 },
      { label: 'Code Sheets', path: '/code-sheets', permission: 'codesheet:view', phase: 3 },
      { label: 'Lab Codes', path: '/lab-codes', permission: 'labcode:view', phase: 3 },
      { label: 'Cabinets', path: '/cabinets', permission: 'cabinet:view', phase: 3 },
      { label: 'Reports', path: '/reports', permission: 'report:view', phase: 3 },
      { label: 'Analytics', path: '/analytics', permission: 'applicationprefs:reports' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: DollarOutlined,
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
    icon: TeamOutlined,
    items: [
      { label: 'Employees', path: '/employees', permission: 'employee:view', phase: 7 },
      { label: 'Departments', path: '/departments', permission: 'department:view', phase: 7 },
      { label: 'Payroll', path: '/payroll', permission: 'payroll:view', phase: 7 },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    icon: AppstoreOutlined,
    items: [
      { label: 'Users', path: '/users', permission: 'user:view' },
      { label: 'Roles', path: '/roles', permission: 'role:view' },
      { label: 'Workspaces', path: '/workspaces', phase: 8 },
      { label: 'Messaging', path: '/messaging', permission: 'message:view', phase: 8 },
      { label: 'Notifications', path: '/notifications', permission: 'notification:view', phase: 8 },
      { label: 'Appointments', path: '/appointments', phase: 8 },
      { label: 'Search', path: '/search', phase: 8 },
      { label: 'Settings', path: '/settings', permission: 'applicationprefs:view' },
      { label: 'Files', path: '/files', phase: 8 },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const navItemByPath = (path: string): NavItem | undefined =>
  ALL_ITEMS.find((i) => i.path === path);
