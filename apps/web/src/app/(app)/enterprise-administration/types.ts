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

export interface EnterpriseAdminOverview {
  asOf: string;
  permissionMatrix: Section<EffectiveAdminPermissions>;
  laboratory: Section<null>;
  branding: Section<null>;
  departments: Section<null>;
  users: Section<null>;
  roles: Section<null>;
  permissions: Section<null>;
  security: Section<null>;
  clients: Section<null>;
  labCodes: Section<null>;
  codeSheets: Section<null>;
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
  lifecycle: Section<null>;
}

// The deferred-section keys (everything except the ready permissionMatrix) in the frozen
// implementation-plan order. Each maps to a section on the aggregate; the workspace reads only
// each section's `status` (never fabricated data) until its checkpoint hydrates it.
export type DeferredSectionKey =
  | 'laboratory' | 'branding' | 'departments' | 'users' | 'roles' | 'permissions'
  | 'security' | 'clients' | 'labCodes' | 'codeSheets' | 'forms' | 'fhir'
  | 'notifications' | 'billing' | 'services' | 'taxes' | 'featureFlags'
  | 'systemHealth' | 'aiSettings' | 'portalAccess' | 'lifecycle';
