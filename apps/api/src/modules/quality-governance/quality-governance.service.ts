import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';

// ── Quality & Governance aggregate (orchestration only) ──────────────────────
// C2: a THIN read-only aggregate. It owns no persistence, runs no Prisma query, calls no
// quality owner service, and performs no quality computation, ranking, or benchmark math.
// Only the descriptive permission map resolves; every evidence section is intentionally
// `deferred` until its checkpoint (C3–C10). The section-status contract is FROZEN here and
// never re-shaped; later checkpoints only change a section's `data` generic and status.
// Contract: docs/PATHOS_QUALITY_IMPLEMENTATION_PLAN.md (§1 Orchestration Rule, §3, §9).

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// Descriptive permission map — mirrors REAL owner permission codes from the caller's
// claims. It grants nothing and aliases nothing; owner endpoints remain the enforcement
// authority. `medicalDirector` is a PERMISSION-derived oversight capability (not a role
// name): oversight actions — proficiency grading, authorization oversight — are gated by
// `resultsheet:authorize`. `changerequest:*` is mirrored truthfully: it is not seeded, so
// `has()` is false for every non-superuser (never aliased to `record:view`).
export interface EffectiveQualityPermissions {
  viewRecord: boolean; // record:view — entry gate + most quality sections
  changeRecord: boolean; // record:change — resolve/review actions
  viewResultSheet: boolean; // resultsheet:view — result-sheet governance events
  authorize: boolean; // resultsheet:authorize — proficiency grade, authorization oversight
  viewResultEntry: boolean; // resultentry:view — Bethesda evidence
  viewReport: boolean; // report:view — benchmarks
  security: boolean; // system:security — security/login governance
  viewNotification: boolean; // notification:view — notification history
  viewChangeRequest: boolean; // changerequest:view — change-request governance (currently unseeded)
  changeChangeRequest: boolean; // changerequest:change — (currently unseeded)
  medicalDirector: boolean; // permission-derived oversight capability, NOT a role name
}

export interface QualityOverviewAggregate {
  asOf: string;
  permissions: Section<EffectiveQualityPermissions>;
  // The ten evidence sections — deferred at C2. Each carries its own status so a future
  // section failure isolates to that section and never collapses permissions or siblings.
  overview: Section<null>;
  correlation: Section<null>;
  discordance: Section<null>;
  qc: Section<null>;
  proficiency: Section<null>;
  escalations: Section<null>;
  recall: Section<null>;
  benchmarks: Section<null>;
  medicalDirector: Section<null>;
  governance: Section<null>;
}

const deferred = (): Section<null> => ({ status: 'deferred', data: null });

@Injectable()
export class QualityGovernanceService {
  overview(user: AuthUser): QualityOverviewAggregate {
    // Permissions resolve independently of any evidence load (partial-failure tolerance):
    // they survive every future downstream failure.
    const perms = buildPermissions(user);
    return {
      asOf: new Date().toISOString(),
      permissions: { status: 'ready', data: perms },
      overview: deferred(),
      correlation: deferred(),
      discordance: deferred(),
      qc: deferred(),
      proficiency: deferred(),
      escalations: deferred(),
      recall: deferred(),
      benchmarks: deferred(),
      medicalDirector: deferred(),
      governance: deferred(),
    };
  }
}

function buildPermissions(user: AuthUser): EffectiveQualityPermissions {
  const has = (code: string) => !!user.isSuperRole || user.permissions.includes(code);
  return {
    viewRecord: has('record:view'),
    changeRecord: has('record:change'),
    viewResultSheet: has('resultsheet:view'),
    authorize: has('resultsheet:authorize'),
    viewResultEntry: has('resultentry:view'),
    viewReport: has('report:view'),
    security: has('system:security'),
    viewNotification: has('notification:view'),
    viewChangeRequest: has('changerequest:view'),
    changeChangeRequest: has('changerequest:change'),
    // Permission-derived, never role-name-derived (docs §7 / §12: MD persona maps to the
    // holders of the oversight permission, not to a seeded "Medical Director" role).
    medicalDirector: has('resultsheet:authorize'),
  };
}
