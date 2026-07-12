import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { LabService } from '../lab/lab.service';
import { DepartmentsService } from '../departments/departments.service';

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

// The remaining evidence sections stay deferred. Each carries its own status so a future section
// failure isolates to it and never collapses `permissionMatrix`, siblings, or the shell.
export interface EnterpriseAdminOverview {
  asOf: string;
  permissionMatrix: Section<EffectiveAdminPermissions>;
  laboratory: Section<LaboratorySection>;
  branding: Section<BrandingSection>;
  departments: Section<DepartmentsSection>;
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
  ) {}

  async overview(user: AuthUser): Promise<EnterpriseAdminOverview> {
    // The permission map resolves independently of any evidence load, so it survives every
    // downstream failure. Sections resolve independently (partial-failure isolation): one owner
    // failing marks only its section and never collapses the permission map or siblings.
    const perms = buildPermissions(user);
    const [laboratory, branding, departments] = await Promise.all([
      this.loadLaboratory(perms),
      this.loadBranding(perms),
      this.loadDepartments(perms),
    ]);
    return {
      asOf: new Date().toISOString(),
      permissionMatrix: { status: 'ready', data: perms },
      laboratory,
      branding,
      departments,
      users: deferred(),
      roles: deferred(),
      permissions: deferred(),
      security: deferred(),
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
}
