// Client mirror of GET /enterprise-administration/overview (apps/api enterprise-administration
// module). Read-only orchestration aggregate; every section carries its own status so a future
// section failure isolates to that section and never collapses the permission map, siblings, or
// the shell. The permission map is descriptive only; owner endpoints remain the enforcement authority.

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// Descriptive permission map — mirrors REAL owner permission codes from the caller's claims.
// Truthful reality: laboratory/branding/AI = `applicationprefs:*` (no `lab:*`); forms =
// `formconfig:view`/`formconfig:manage` (no `formconfig:change`); `featureFlags` = the
// `SuperuserGuard`/`isSuperRole` bypass (no permission code); `portaluser:*`/`changerequest:*`
// are declared-but-unseeded → false for every non-superuser (never aliased).
export interface EffectiveAdminPermissions {
  viewRecord: boolean;
  viewRecordStatus: boolean;
  changeRecordStatus: boolean;
  viewLabConfig: boolean;
  changeLabConfig: boolean;
  viewDepartment: boolean;
  changeDepartment: boolean;
  viewUser: boolean;
  changeUser: boolean;
  viewRole: boolean;
  changeRole: boolean;
  viewPermission: boolean;
  viewClient: boolean;
  changeClient: boolean;
  viewLabCode: boolean;
  changeLabCode: boolean;
  viewCodeSheet: boolean;
  changeCodeSheet: boolean;
  viewFormConfig: boolean;
  manageFormConfig: boolean;
  systemSecurity: boolean;
  systemHealth: boolean;
  viewService: boolean;
  changeService: boolean;
  viewTax: boolean;
  changeTax: boolean;
  viewNotification: boolean;
  viewPortalUser: boolean;
  changePortalUser: boolean;
  viewChangeRequest: boolean;
  changeChangeRequest: boolean;
  featureFlags: boolean;
  isSuperRole: boolean;
}

// Laboratory — recorded lab profile (owner: LabService.getProfile), shown verbatim. No computed
// status, no fabricated missing-config warning.
export interface LaboratorySection {
  name: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string | null;
}

// Branding — recorded name/tagline + logo PRESENCE only (owner: LabService.getBranding). The logo
// URL and any storage/upload credential are never surfaced; colours are not recorded, so omitted.
export interface BrandingSection {
  name: string | null;
  tagline: string | null;
  logoConfigured: boolean;
}

// Departments — recorded rows (owner: DepartmentsService.findAll). Owner fields only; no active
// state (unrecorded) and no hierarchy (never calculated).
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number | null;
  managerName: string | null;
  createdAt: string | null;
}
export interface DepartmentsSection {
  total: number;
  items: DepartmentRow[];
}

// Users — recorded directory (owner: UsersService.findAll). Owner fields only; no password hash /
// token / MFA secret / department / last-login (unexposed). `active` is the recorded isActive flag,
// never an inferred risk level.
export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  roles: string[];
  createdAt: string | null;
  ownerPath: string;
}
export interface UsersSection {
  total: number;
  items: UserRow[];
}

// Roles — recorded roles (owner: RolesService.findRoles). `isSuperRole` is the stored flag (not a
// role name used for authority); `permissionCount` is the owner-included permission-set length.
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSuperRole: boolean;
  permissionCount: number;
  ownerPath: string;
}
export interface RolesSection {
  total: number;
  items: RoleRow[];
}

// Permissions — the current catalog (owner: RolesService.findPermissions). object/action split from
// `code`; description is the owner `label`. No per-permission provenance flag (unrecorded), and
// roles-that-hold is not exposed, so both are omitted (no inferred access).
export interface PermissionRow {
  code: string;
  object: string;
  action: string;
  description: string | null;
  ownerPath: string;
}
export interface PermissionsSection {
  total: number;
  items: PermissionRow[];
}

// Security posture — safe owner counts (owner: SecurityService.getDashboard) + the newest recorded
// security-event timestamp. No raw login/alert rows, no secrets, no derived risk/threat/grade.
export interface SecuritySection {
  activeSessions: number;
  failedLogins24h: number;
  lockedAccounts: number;
  openAlerts: number;
  blockedIps: number;
  lastEventAt: string | null;
  ownerPath: string;
}

// Clients — recorded directory (owner: ClientsService.findAll). `contact` is the owner's business
// email/phone; `portalAccountConfigured` is a status boolean reflecting only the presence of a related
// PortalUser record — not enabled access/login/credentials/2FA (no portal PII). No inferred eligibility.
export interface ClientRow {
  id: string;
  name: string | null;
  accountNumber: string | null;
  clientType: string | null;
  contact: string | null;
  location: string | null;
  active: boolean;
  portalAccountConfigured: boolean;
  createdAt: string | null;
  ownerPath: string;
}
export interface ClientsSection {
  total: number;
  items: ClientRow[];
}

// Lab codes — recorded codes (owner: LabCodesService.findAll). `clientsUsing` is the owner _count.
export interface LabCodeRow {
  id: string;
  code: string;
  region: string | null;
  clientsUsing: number | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface LabCodesSection {
  total: number;
  items: LabCodeRow[];
}

// Code sheets — recorded sheets (owner: CodeSheetsService.findCodeSheets). Owner fields only.
export interface CodeSheetRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface CodeSheetsSection {
  total: number;
  items: CodeSheetRow[];
}

export interface EnterpriseAdminOverview {
  asOf: string;
  permissionMatrix: Section<EffectiveAdminPermissions>;
  laboratory: Section<LaboratorySection>;
  branding: Section<BrandingSection>;
  departments: Section<DepartmentsSection>;
  users: Section<UsersSection>;
  roles: Section<RolesSection>;
  permissions: Section<PermissionsSection>;
  security: Section<SecuritySection>;
  clients: Section<ClientsSection>;
  labCodes: Section<LabCodesSection>;
  codeSheets: Section<CodeSheetsSection>;
  forms: Section<null>;
  fhir: Section<null>;
  notifications: Section<null>;
  billing: Section<null>;
  services: Section<null>;
  taxes: Section<null>;
  featureFlags: Section<null>;
  systemHealth: Section<null>;
  aiSettings: Section<null>;
  portalAccess: Section<null>;
  lifecycle: Section<LifecycleSection>;
}

// Lifecycle Observation — OBSERVE only. Owner-recorded per-status counts (owner: RecordsService.
// findAll per RecordStatus, record:view) in owner-declared enum order. No transition metadata, no
// event history, no editing. The panel states the current reality: event-driven, owner actions
// advance, manual changes constrained, observation-only; Pending is initial; no Started/Released/Archived.
export interface LifecycleStatusCount {
  status: string;
  count: number;
}
export interface LifecycleSection {
  statuses: LifecycleStatusCount[];
  totalRecords: number;
  ownerPath: string;
}

// The deferred-section keys (everything except the ready permissionMatrix) in the frozen
// implementation-plan order. Each maps to a section on the aggregate; the workspace reads only
// each section's `status` (never fabricated data) until its checkpoint hydrates it.
export type DeferredSectionKey =
  | 'laboratory' | 'branding' | 'departments' | 'users' | 'roles' | 'permissions'
  | 'security' | 'clients' | 'labCodes' | 'codeSheets' | 'forms' | 'fhir'
  | 'notifications' | 'billing' | 'services' | 'taxes' | 'featureFlags'
  | 'systemHealth' | 'aiSettings' | 'portalAccess' | 'lifecycle';
