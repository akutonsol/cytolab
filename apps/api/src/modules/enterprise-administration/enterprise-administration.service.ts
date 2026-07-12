import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { LabService } from '../lab/lab.service';
import { DepartmentsService } from '../departments/departments.service';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { SecurityService } from '../security/security.service';

// ── Enterprise Administration aggregate (orchestration only) ──────────────────
// A2: a THIN read-only aggregate. It owns no persistence, runs no Prisma query, calls no
// administration owner service, performs no configuration calculation, creates no audit or
// lifecycle event, and exposes NO secret. Only the descriptive permission map (`permissionMatrix`)
// resolves; every other section is intentionally `deferred` until its checkpoint (A3–A9). The
// section-status contract is FROZEN here and never re-shaped; later checkpoints only change a
// section's `data` generic and status.
// Contract: docs/PATHOS_ENTERPRISE_ADMINISTRATION_IMPLEMENTATION_PLAN.md (§1 Orchestration Rule, §3, §4, §5).

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// Descriptive permission map — mirrors REAL owner permission codes from the caller's claims.
// It grants nothing and aliases nothing; owner endpoints remain the enforcement authority.
// Resolution is `isSuperRole || permissions.includes(code)` — permission-driven, never a role
// name. Truthful mirrors of the current reality:
//   • laboratory / branding / AI settings are owned by `applicationprefs:*` (there is NO `lab:*`).
//   • form configuration is `formconfig:view` / `formconfig:manage` (there is NO `formconfig:change`).
//   • feature flags carry no permission code — they are gated by the `SuperuserGuard`, i.e. the
//     `isSuperRole` flag; `featureFlags` therefore equals the truthful superuser bypass.
//   • `portaluser:*` and `changerequest:*` are declared-but-unseeded, so `has()` is false for every
//     non-superuser (never aliased to `record:view` or anything else).
export interface EffectiveAdminPermissions {
  viewRecord: boolean; // record:view — workspace entry gate
  viewRecordStatus: boolean; // recordstatus:view — lifecycle observation
  changeRecordStatus: boolean; // recordstatus:change — owner-constrained transition (not owned here)
  viewLabConfig: boolean; // applicationprefs:view — lab profile/branding/AI settings/prefs
  changeLabConfig: boolean; // applicationprefs:change
  viewDepartment: boolean; // department:view
  changeDepartment: boolean; // department:change
  viewUser: boolean; // user:view
  changeUser: boolean; // user:change
  viewRole: boolean; // role:view
  changeRole: boolean; // role:change
  viewPermission: boolean; // permission:view
  viewClient: boolean; // client:view
  changeClient: boolean; // client:change
  viewLabCode: boolean; // labcode:view
  changeLabCode: boolean; // labcode:change
  viewCodeSheet: boolean; // codesheet:view
  changeCodeSheet: boolean; // codesheet:change
  viewFormConfig: boolean; // formconfig:view
  manageFormConfig: boolean; // formconfig:manage
  systemSecurity: boolean; // system:security — security posture
  systemHealth: boolean; // system:health — system/logs/support
  viewService: boolean; // service:view
  changeService: boolean; // service:change
  viewTax: boolean; // tax:view
  changeTax: boolean; // tax:change
  viewNotification: boolean; // notification:view
  viewPortalUser: boolean; // portaluser:view — declared-but-unseeded → superuser-only
  changePortalUser: boolean; // portaluser:change — declared-but-unseeded → superuser-only
  viewChangeRequest: boolean; // changerequest:view — declared-but-unseeded → superuser-only
  changeChangeRequest: boolean; // changerequest:change — declared-but-unseeded → superuser-only
  featureFlags: boolean; // no permission code — SuperuserGuard (isSuperRole); surfaced honestly
  isSuperRole: boolean; // truthful superuser bypass flag (a role FLAG, never a role NAME)
}

// ── Laboratory (A3) ──────────────────────────────────────────────────────────
// Recorded laboratory profile from the lab owner (`LabService.getProfile`), shown verbatim. No
// computed status, no fabricated "missing configuration" warning. Gated by `applicationprefs:view`.
export interface LaboratorySection {
  name: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string | null;
}

// ── Branding (A3) ────────────────────────────────────────────────────────────
// Recorded branding from the lab owner (`LabService.getBranding`): name, tagline, and whether a
// logo is configured. The logo asset URL and any upload/storage credential are NEVER surfaced —
// only presence. Gated by `applicationprefs:view`. Branding colours are not recorded by the owner,
// so they are omitted (never fabricated).
export interface BrandingSection {
  name: string | null;
  tagline: string | null;
  logoConfigured: boolean;
}

// ── Departments (A3) ─────────────────────────────────────────────────────────
// Recorded departments from `DepartmentsService.findAll` — owner fields only (name, description,
// member count, created date, manager). The owner records no active-state flag and no parent, so
// no active state and no hierarchy are surfaced (never invented). Gated by `department:view`.
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

// ── Users (A4) ───────────────────────────────────────────────────────────────
// Recorded users from `UsersService.findAll` — owner fields only (identity, account state, assigned
// roles, created date). The owner read exposes NO password hash / token / MFA secret / department /
// last-login, so none is surfaced. No inferred account risk, trust, or effective access. Gated by
// `user:view`.
export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  active: boolean; // recorded isActive flag (account state) — never an inferred risk level
  roles: string[]; // owner-assigned role names only
  createdAt: string | null;
  ownerPath: string;
}
export interface UsersSection {
  total: number;
  items: UserRow[];
}

// ── Roles (A4) ───────────────────────────────────────────────────────────────
// Recorded roles from `RolesService.findRoles`. `isSuperRole` is the stored FLAG (never a role name
// used for authority). `permissionCount` is the length of the owner-included permission set. The
// owner read exposes no assigned-user count, so it is omitted. Gated by `role:view`.
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

// ── Permissions (A4) ─────────────────────────────────────────────────────────
// The current permission catalog from `RolesService.findPermissions`. `object`/`action` are split
// from the owner `code`; `description` is the owner `label`. The owner records no per-permission
// provenance, so no seeded flag is claimed. Which roles hold each permission is not exposed by this
// read, so it is omitted — no inferred effective access, no synthetic grouping, no severity. Gated by
// `permission:view`.
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

// ── Security posture (A5) ────────────────────────────────────────────────────
// Safe, owner-recorded security indicators from `SecurityService.getDashboard` — COUNTS only (active
// sessions, failed logins in 24h, locked accounts, open alerts, blocked IPs) plus the most recent
// recorded security-event timestamp. The owner's raw recent-login/alert rows (which carry email/IP)
// are NOT surfaced; the detail lives on the `/security` owner surface. No password/token/MFA/backup
// material ever enters the payload. No derived compromise/account/trust/threat/grade/compliance score.
// Gated by `system:security`.
export interface SecuritySection {
  activeSessions: number;
  failedLogins24h: number;
  lockedAccounts: number;
  openAlerts: number;
  blockedIps: number;
  lastEventAt: string | null; // newest recorded security-event time (owner login/alert); safe timestamp
  ownerPath: string;
}

// The remaining evidence sections stay deferred. Each carries its own status so a future section
// failure isolates to it and never collapses `permissionMatrix`, siblings, or the shell.
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

const deferred = (): Section<null> => ({ status: 'deferred', data: null });

function buildPermissions(user: AuthUser): EffectiveAdminPermissions {
  const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
  return {
    viewRecord: has('record:view'),
    viewRecordStatus: has('recordstatus:view'),
    changeRecordStatus: has('recordstatus:change'),
    viewLabConfig: has('applicationprefs:view'),
    changeLabConfig: has('applicationprefs:change'),
    viewDepartment: has('department:view'),
    changeDepartment: has('department:change'),
    viewUser: has('user:view'),
    changeUser: has('user:change'),
    viewRole: has('role:view'),
    changeRole: has('role:change'),
    viewPermission: has('permission:view'),
    viewClient: has('client:view'),
    changeClient: has('client:change'),
    viewLabCode: has('labcode:view'),
    changeLabCode: has('labcode:change'),
    viewCodeSheet: has('codesheet:view'),
    changeCodeSheet: has('codesheet:change'),
    viewFormConfig: has('formconfig:view'),
    manageFormConfig: has('formconfig:manage'),
    systemSecurity: has('system:security'),
    systemHealth: has('system:health'),
    viewService: has('service:view'),
    changeService: has('service:change'),
    viewTax: has('tax:view'),
    changeTax: has('tax:change'),
    viewNotification: has('notification:view'),
    viewPortalUser: has('portaluser:view'),
    changePortalUser: has('portaluser:change'),
    viewChangeRequest: has('changerequest:view'),
    changeChangeRequest: has('changerequest:change'),
    featureFlags: !!user.isSuperRole, // SuperuserGuard checks the isSuperRole flag; no permission code exists
    isSuperRole: !!user.isSuperRole,
  };
}

@Injectable()
export class EnterpriseAdministrationService {
  // Orchestration only: it injects existing owner services and reads them; it holds NO Prisma,
  // duplicates no owner validation/persistence, and computes nothing the owners do not expose.
  constructor(
    private readonly lab: LabService,
    private readonly departments: DepartmentsService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly security: SecurityService,
  ) {}

  async overview(user: AuthUser): Promise<EnterpriseAdminOverview> {
    // The permission map resolves independently of any evidence load, so it survives every
    // downstream failure. Sections resolve independently (partial-failure isolation): one owner
    // failing marks only its section and never collapses the permission map or siblings.
    const perms = buildPermissions(user);
    const [laboratory, branding, departments, users, roles, permissions, security] = await Promise.all([
      this.loadLaboratory(perms),
      this.loadBranding(perms),
      this.loadDepartments(perms),
      this.loadUsers(perms),
      this.loadRoles(perms),
      this.loadPermissions(perms),
      this.loadSecurity(perms),
    ]);
    return {
      asOf: new Date().toISOString(),
      permissionMatrix: { status: 'ready', data: perms },
      laboratory,
      branding,
      departments,
      users,
      roles,
      permissions,
      security,
      clients: deferred(),
      labCodes: deferred(),
      codeSheets: deferred(),
      forms: deferred(),
      fhir: deferred(),
      notifications: deferred(),
      billing: deferred(),
      services: deferred(),
      taxes: deferred(),
      featureFlags: deferred(),
      systemHealth: deferred(),
      aiSettings: deferred(),
      portalAccess: deferred(),
      lifecycle: deferred(),
    };
  }

  // Laboratory — the recorded profile from the lab owner, shown verbatim. Gated descriptively by
  // `applicationprefs:view` (the owner's own gate), so we never surface more than the owner would.
  private async loadLaboratory(perms: EffectiveAdminPermissions): Promise<Section<LaboratorySection>> {
    if (!perms.viewLabConfig) return { status: 'forbidden', data: null };
    try {
      const p: any = await this.lab.getProfile();
      if (!p) return { status: 'empty', data: null };
      return {
        status: 'ready',
        data: {
          name: p.name ?? null,
          tagline: p.tagline ?? null,
          address: p.address ?? null,
          phone: p.phone ?? null,
          email: p.email ?? null,
          currency: p.currency ?? null,
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Laboratory profile failed to load' };
    }
  }

  // Branding — recorded name/tagline and logo PRESENCE only. The logo URL and any storage/upload
  // credential are never read into the payload. Gated by `applicationprefs:view`.
  private async loadBranding(perms: EffectiveAdminPermissions): Promise<Section<BrandingSection>> {
    if (!perms.viewLabConfig) return { status: 'forbidden', data: null };
    try {
      const b: any = await this.lab.getBranding();
      if (!b) return { status: 'empty', data: null };
      return {
        status: 'ready',
        data: { name: b.name ?? null, tagline: b.tagline ?? null, logoConfigured: !!b.logoUrl },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Branding failed to load' };
    }
  }

  // Departments — recorded rows from the owner. Owner fields only; no active state (unrecorded),
  // no hierarchy (never calculated). Gated by `department:view`.
  private async loadDepartments(perms: EffectiveAdminPermissions): Promise<Section<DepartmentsSection>> {
    if (!perms.viewDepartment) return { status: 'forbidden', data: null };
    try {
      const page: any = await this.departments.findAll({ pageSize: 100 } as any);
      const rows: any[] = Array.isArray(page?.data) ? page.data : Array.isArray(page) ? page : [];
      if (!rows.length) return { status: 'empty', data: null };
      const items: DepartmentRow[] = rows.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        memberCount: typeof d._count?.employees === 'number' ? d._count.employees : null,
        managerName: d.manager ? `${d.manager.firstName ?? ''} ${d.manager.lastName ?? ''}`.trim() || null : null,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      }));
      return { status: 'ready', data: { total: typeof page?.total === 'number' ? page.total : items.length, items } };
    } catch {
      return { status: 'error', data: null, reason: 'Departments failed to load' };
    }
  }

  // Users — recorded directory from the owner. Owner fields only; no password hash / token / MFA
  // secret / department / last-login (the read exposes none). Bounded. Gated by `user:view`.
  private async loadUsers(perms: EffectiveAdminPermissions): Promise<Section<UsersSection>> {
    if (!perms.viewUser) return { status: 'forbidden', data: null };
    try {
      const rows: any[] = await this.users.findAll();
      if (!Array.isArray(rows) || !rows.length) return { status: 'empty', data: null };
      const items: UserRow[] = rows.map((u) => ({
        id: u.id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null,
        email: u.email,
        active: !!u.isActive,
        roles: Array.isArray(u.roles) ? u.roles.map((r: any) => r?.name).filter(Boolean) : [],
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        ownerPath: '/users',
      }));
      items.sort(userSort);
      return { status: 'ready', data: { total: items.length, items: items.slice(0, 200) } };
    } catch {
      return { status: 'error', data: null, reason: 'Users failed to load' };
    }
  }

  // Roles — recorded roles from the owner. `isSuperRole` is the stored flag; `permissionCount` is the
  // owner-included permission-set length. No assigned-user count (unexposed). Gated by `role:view`.
  private async loadRoles(perms: EffectiveAdminPermissions): Promise<Section<RolesSection>> {
    if (!perms.viewRole) return { status: 'forbidden', data: null };
    try {
      const rows: any[] = await this.roles.findRoles();
      if (!Array.isArray(rows) || !rows.length) return { status: 'empty', data: null };
      const items: RoleRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        isSuperRole: !!r.isSuperRole,
        permissionCount: Array.isArray(r.permissions) ? r.permissions.length : 0,
        ownerPath: '/roles',
      }));
      items.sort(roleSort);
      return { status: 'ready', data: { total: items.length, items: items.slice(0, 100) } };
    } catch {
      return { status: 'error', data: null, reason: 'Roles failed to load' };
    }
  }

  // Permissions — the catalog from the owner. `object`/`action` split from the owner `code`;
  // `description` is the owner `label`; roles-that-hold is not exposed by this read, so it is omitted
  // (no inferred effective access). Bounded. Gated by `permission:view`.
  private async loadPermissions(perms: EffectiveAdminPermissions): Promise<Section<PermissionsSection>> {
    if (!perms.viewPermission) return { status: 'forbidden', data: null };
    try {
      const rows: any[] = await this.roles.findPermissions();
      if (!Array.isArray(rows) || !rows.length) return { status: 'empty', data: null };
      const items: PermissionRow[] = rows.map((p) => {
        const [object, action] = String(p.code).split(':');
        return {
          code: String(p.code),
          object: object ?? String(p.code),
          action: action ?? '',
          description: p.label ?? null,
          ownerPath: '/roles',
        };
      });
      items.sort(permissionSort);
      return { status: 'ready', data: { total: items.length, items: items.slice(0, 300) } };
    } catch {
      return { status: 'error', data: null, reason: 'Permissions failed to load' };
    }
  }

  // Security posture — safe owner counts from `SecurityService.getDashboard` (all `count()` integers),
  // plus the newest recorded security-event timestamp. The owner's raw login/alert rows are never
  // surfaced (only the newest timestamp is read); no secret material and no derived risk/threat/grade.
  // Gated by `system:security` (never falls back to record:view). Counts of 0 are valid recorded
  // posture, so this section is `ready` (not `empty`) whenever the owner read succeeds.
  private async loadSecurity(perms: EffectiveAdminPermissions): Promise<Section<SecuritySection>> {
    if (!perms.systemSecurity) return { status: 'forbidden', data: null };
    try {
      const d: any = await this.security.getDashboard();
      const k = d?.kpis ?? {};
      const n = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
      // Newest recorded security-event time: the max of the owner's recent login/alert timestamps
      // (a factual pick of the latest owner timestamp — never an inferred metric).
      const stamps: number[] = [];
      for (const arr of [d?.recentLogins, d?.recentAlerts]) {
        const t = Array.isArray(arr) && arr[0]?.createdAt ? new Date(arr[0].createdAt).getTime() : NaN;
        if (!Number.isNaN(t)) stamps.push(t);
      }
      const lastEventAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
      return {
        status: 'ready',
        data: {
          activeSessions: n(k.activeSessions),
          failedLogins24h: n(k.failedLogins24h),
          lockedAccounts: n(k.lockedAccounts),
          openAlerts: n(k.openAlerts),
          blockedIps: n(k.blockedIps),
          lastEventAt,
          ownerPath: '/security',
        },
      };
    } catch {
      return { status: 'error', data: null, reason: 'Security posture failed to load' };
    }
  }
}

// ── Identity & Access deterministic ordering (recorded fields only) ──────────
// Users: recorded active state first (owner `isActive`), then display name/email, then a stable id.
// Reflects the recorded account flag only — never inferred privilege, trust, or risk.
function userSort(x: UserRow, y: UserRow): number {
  if (x.active !== y.active) return x.active ? -1 : 1;
  const kx = (x.name ?? x.email).toLowerCase();
  const ky = (y.name ?? y.email).toLowerCase();
  return kx < ky ? -1 : kx > ky ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

// Roles: stored super-role flag first, then name, then a stable id. From the stored flag only.
function roleSort(x: RoleRow, y: RoleRow): number {
  if (x.isSuperRole !== y.isSuperRole) return x.isSuperRole ? -1 : 1;
  const kx = x.name.toLowerCase();
  const ky = y.name.toLowerCase();
  return kx < ky ? -1 : kx > ky ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

// Permissions: object/domain, then action, then code. Never by inferred privilege or importance.
function permissionSort(x: PermissionRow, y: PermissionRow): number {
  return x.object < y.object ? -1 : x.object > y.object ? 1
    : x.action < y.action ? -1 : x.action > y.action ? 1
    : x.code < y.code ? -1 : x.code > y.code ? 1 : 0;
}
