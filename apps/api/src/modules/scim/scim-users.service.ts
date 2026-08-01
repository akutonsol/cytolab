import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, UserLifecycleState } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { ScimOperation, ScimOutcome } from '../audit/audit-metadata';
import { IdentityLifecycleService, LifecycleActor } from '../identity-lifecycle/identity-lifecycle.service';
import { ScimException } from './scim-error';
import { SCIM_ERROR_TYPES } from './scim.constants';
import { ScimMappingSource, ScimUserSource, toScimListResponse, toScimUser, versionMatches } from './scim-serialization';
import { ScimListQueryDto, ScimPatchDto, ScimUserWriteDto } from './dto/scim-user.dto';

/**
 * Program 7 · Phase 7B.3 — SCIM Users. Inbound SCIM 2.0 provisioning that is TRANSPORT ONLY into the frozen 7B.1
 * lifecycle. Every lifecycle effect (create-entry / activate / suspend / reactivate / terminal deprovision) flows
 * through `IdentityLifecycleService` (the sole writer, L8) — SCIM NEVER writes `User.lifecycleState`/`isActive`. The
 * SCIM `externalId` lives in the IMMUTABLE, append-only `ScimUserMapping` (never on `User`); ordinary SCIM ops never
 * re-point/delete it (an `externalId` reassignment fails closed on `[labId, externalId]` uniqueness). `labId` comes
 * ONLY from the authenticated ServicePrincipal token (via `LabContext`); SCIM grants no permission, mints no session,
 * writes no FederatedIdentity, manages no password, and touches no clinical/AI path. Conflicts resolve deterministically
 * (409 uniqueness / 412 stale-version / single-winner) — no heuristic reconciliation.
 */
export interface ScimPrincipal {
  servicePrincipalId?: string; // the SCIM connector (attribution/provenance) — from the token
}

const USER_SELECT = { id: true, email: true, firstName: true, lastName: true, isActive: true, lifecycleState: true, updatedAt: true } as const;
type LoadedUser = { id: string; email: string; firstName: string; lastName: string; isActive: boolean; lifecycleState: UserLifecycleState; updatedAt: Date };

@Injectable()
export class ScimUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly audit: AuditRecorder,
    private readonly lifecycle: IdentityLifecycleService,
  ) {}

  private requireLab(): string {
    const labId = this.labContext.getLabId();
    if (!labId) throw new BadRequestException('SCIM requires a lab context');
    return labId;
  }

  // ── Create (POST /Users) ────────────────────────────────────────────────────────────────────────────────────────
  async createUser(input: ScimUserWriteDto, principal: ScimPrincipal): Promise<{ resource: Record<string, unknown>; created: boolean }> {
    const labId = this.requireLab();
    const externalId = (input.externalId ?? '').trim();
    const userName = (input.userName ?? '').trim();
    if (!externalId) throw new ScimException(HttpStatus.BAD_REQUEST, 'externalId is required', SCIM_ERROR_TYPES.invalidValue);
    if (!userName) throw new ScimException(HttpStatus.BAD_REQUEST, 'userName is required', SCIM_ERROR_TYPES.invalidValue);
    const email = userName.toLowerCase();
    const firstName = input.name?.givenName?.trim() ?? '';
    const lastName = input.name?.familyName?.trim() ?? '';
    const desiredActive = input.active !== false; // default true (RFC: absent active ⇒ provisioned + enabled)

    const outcome = await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        // Immutable-mapping guard (R3/§4b): an existing externalId is NEVER re-pointed.
        const existing = await tx.scimUserMapping.findFirst({ where: { labId, externalId }, select: { userId: true } });
        if (existing) {
          const existingUser = await tx.user.findFirst({ where: { id: existing.userId, labId }, select: { email: true } });
          if (existingUser && existingUser.email === email) return { userId: existing.userId, created: false as const }; // idempotent create
          throw new ScimException(HttpStatus.CONFLICT, 'externalId is already mapped to a different identity', SCIM_ERROR_TYPES.uniqueness);
        }
        // Deterministic userName/email uniqueness (never reassign an email to a different identity).
        const emailDup = await tx.user.findFirst({ where: { labId, email }, select: { id: true } });
        if (emailDup) throw new ScimException(HttpStatus.CONFLICT, 'a user with this userName already exists', SCIM_ERROR_TYPES.uniqueness);
        const account = await tx.account.findFirst({ where: { labId }, select: { id: true } });
        if (!account) throw new ScimException(HttpStatus.BAD_REQUEST, 'lab account missing', SCIM_ERROR_TYPES.invalidValue);
        // SCIM-provisioned identity: placeholder (unusable) password, PROVISIONED entry, isActive=false. `.user.create`
        // (creation provenance) — NOT a lifecycle transition; the entry event is recorded via the boundary below.
        const user = await tx.user.create({
          data: { labId, accountId: account.id, email, firstName, lastName, passwordHash: await argon2.hash(placeholderSecret()), isActive: false, lifecycleState: UserLifecycleState.PROVISIONED, originProvisioningSource: 'SCIM' },
          select: { id: true },
        });
        await tx.scimUserMapping.create({ data: { labId, userId: user.id, externalId, servicePrincipalId: principal.servicePrincipalId ?? null } });
        return { userId: user.id, created: true as const };
      }),
    );

    if (!outcome.created) return { resource: await this.loadResource(outcome.userId), created: false };

    // Lifecycle entry through the sole-writer boundary (records null→PROVISIONED evidence; activate if requested).
    await this.labContext.runLabScoped(labId, async () => {
      await this.lifecycle.provision(outcome.userId, UserLifecycleState.PROVISIONED, this.actor('SCIM create'));
      if (desiredActive) await this.lifecycle.activate(outcome.userId, this.actor('SCIM create active=true'));
    });
    await this.recordSync('create', desiredActive ? 'activated' : 'provisioned', true, outcome.userId);
    return { resource: await this.loadResource(outcome.userId), created: true };
  }

  // ── Read (GET /Users/{id}) ──────────────────────────────────────────────────────────────────────────────────────
  async getUser(id: string): Promise<Record<string, unknown>> {
    return this.loadResource(id);
  }

  // ── List (GET /Users) ───────────────────────────────────────────────────────────────────────────────────────────
  async listUsers(query: ScimListQueryDto): Promise<Record<string, unknown>> {
    const labId = this.requireLab();
    const startIndex = Math.max(1, parseInt(query.startIndex ?? '1', 10) || 1);
    const count = Math.min(200, Math.max(0, parseInt(query.count ?? '100', 10) || 100));
    const filter = this.parseEqFilter(query.filter);

    return this.labContext.runSystem(async () => {
      // Baseline: list only SCIM-managed identities (those with a mapping). Optional eq filter on userName/externalId.
      const mappingWhere: Prisma.ScimUserMappingWhereInput = { labId };
      if (filter?.attr === 'externalId') mappingWhere.externalId = filter.value;
      let mappings = await this.prisma.scimUserMapping.findMany({ where: mappingWhere, select: { userId: true, externalId: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
      if (filter?.attr === 'userName') {
        const match = await this.prisma.user.findFirst({ where: { labId, email: filter.value.toLowerCase() }, select: { id: true } });
        mappings = match ? mappings.filter((m) => m.userId === match.id) : [];
      }
      const total = mappings.length;
      const page = mappings.slice(startIndex - 1, startIndex - 1 + count);
      const resources: Array<Record<string, unknown>> = [];
      for (const m of page) {
        const user = await this.prisma.user.findFirst({ where: { id: m.userId, labId }, select: USER_SELECT });
        if (user) resources.push(toScimUser(user as ScimUserSource, { externalId: m.externalId, createdAt: m.createdAt } as ScimMappingSource));
      }
      return toScimListResponse(resources, total, startIndex, resources.length);
    });
  }

  // ── Replace (PUT /Users/{id}) ───────────────────────────────────────────────────────────────────────────────────
  async replaceUser(id: string, input: ScimUserWriteDto, ifMatch: string | undefined, _principal: ScimPrincipal): Promise<Record<string, unknown>> {
    const { user, mapping } = await this.load(id);
    this.assertVersion(ifMatch, user.updatedAt);
    this.assertExternalIdUnchanged(input.externalId, mapping.externalId);
    const userName = (input.userName ?? user.email).trim();
    const nextEmail = userName.toLowerCase();
    const nextFirst = input.name?.givenName?.trim() ?? '';
    const nextLast = input.name?.familyName?.trim() ?? '';
    const attrChanged = await this.writeAttributes(user, { email: nextEmail, firstName: nextFirst, lastName: nextLast });
    const life = input.active === undefined ? { outcome: 'no_op' as ScimOutcome, changed: false } : await this.applyActive(user, input.active);
    await this.recordSync('replace', this.mergeOutcome(attrChanged, life), attrChanged || life.changed, id);
    return this.loadResource(id);
  }

  // ── Patch (PATCH /Users/{id}) ───────────────────────────────────────────────────────────────────────────────────
  async patchUser(id: string, patch: ScimPatchDto, ifMatch: string | undefined, _principal: ScimPrincipal): Promise<Record<string, unknown>> {
    const { user, mapping } = await this.load(id);
    this.assertVersion(ifMatch, user.updatedAt);
    if (!Array.isArray(patch.Operations) || patch.Operations.length === 0) throw new ScimException(HttpStatus.BAD_REQUEST, 'PatchOp Operations required', SCIM_ERROR_TYPES.invalidSyntax);

    const attrs: { email?: string; firstName?: string; lastName?: string } = {};
    let desiredActive: boolean | undefined;
    for (const op of patch.Operations) {
      const verb = (op.op ?? '').toLowerCase();
      if (verb !== 'add' && verb !== 'replace' && verb !== 'remove') throw new ScimException(HttpStatus.BAD_REQUEST, `unsupported op "${op.op}"`, SCIM_ERROR_TYPES.invalidSyntax);
      const path = (op.path ?? '').toLowerCase();
      const value = op.value;
      if (path === 'externalid') this.assertExternalIdUnchanged(this.asString(value), mapping.externalId);
      else if (path === 'active') desiredActive = this.asBoolean(value);
      else if (path === 'username') attrs.email = this.asString(value)?.toLowerCase();
      else if (path === 'name.givenname') attrs.firstName = this.asString(value) ?? '';
      else if (path === 'name.familyname') attrs.lastName = this.asString(value) ?? '';
      else if (path === '' && value && typeof value === 'object') this.collectFromValueObject(value as Record<string, unknown>, attrs, (a) => (desiredActive = a), mapping.externalId);
      // Unknown/unsupported paths are ignored (RFC-lenient) — never a heuristic mutation.
    }

    const next = { email: attrs.email ?? user.email, firstName: attrs.firstName ?? user.firstName, lastName: attrs.lastName ?? user.lastName };
    const attrChanged = await this.writeAttributes(user, next);
    const life = desiredActive === undefined ? { outcome: 'no_op' as ScimOutcome, changed: false } : await this.applyActive(user, desiredActive);
    await this.recordSync('patch', this.mergeOutcome(attrChanged, life), attrChanged || life.changed, id);
    return this.loadResource(id);
  }

  // ── Delete (DELETE /Users/{id}) — deprovision (terminal), mapping is NEVER deleted (§4b) ────────────────────────
  async deleteUser(id: string, _principal: ScimPrincipal): Promise<void> {
    const { user } = await this.load(id);
    const labId = this.requireLab();
    let changed = false;
    if (user.lifecycleState !== UserLifecycleState.DEPROVISIONED) {
      const r = await this.labContext.runLabScoped(labId, () => this.lifecycle.deprovision(id, this.actor('SCIM delete')));
      changed = r.changed;
    }
    await this.recordSync('delete', changed ? 'deprovisioned' : 'no_op', changed, id);
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** Load a SCIM-managed user + its immutable mapping (both lab-scoped); 404 when either is absent (not SCIM-managed). */
  private async load(id: string): Promise<{ user: LoadedUser; mapping: { externalId: string; createdAt: Date } }> {
    const labId = this.requireLab();
    return this.labContext.runSystem(async () => {
      const user = await this.prisma.user.findFirst({ where: { id, labId }, select: USER_SELECT });
      const mapping = await this.prisma.scimUserMapping.findFirst({ where: { labId, userId: id }, select: { externalId: true, createdAt: true } });
      if (!user || !mapping) throw new ScimException(HttpStatus.NOT_FOUND, 'user not found', SCIM_ERROR_TYPES.noTarget);
      return { user: user as LoadedUser, mapping };
    });
  }

  private async loadResource(id: string): Promise<Record<string, unknown>> {
    const { user, mapping } = await this.load(id);
    return toScimUser(user as ScimUserSource, mapping as ScimMappingSource);
  }

  /** Optimistic-concurrency + single-winner attribute write (never isActive/lifecycleState). Returns whether it changed. */
  private async writeAttributes(user: LoadedUser, next: { email: string; firstName: string; lastName: string }): Promise<boolean> {
    const same = next.email === user.email && next.firstName === user.firstName && next.lastName === user.lastName;
    if (same) return false;
    const labId = this.requireLab();
    return this.labContext.runSystem(async () => {
      // Deterministic email uniqueness (never reassign an email to a different identity).
      if (next.email !== user.email) {
        const dup = await this.prisma.user.findFirst({ where: { labId, email: next.email, NOT: { id: user.id } }, select: { id: true } });
        if (dup) throw new ScimException(HttpStatus.CONFLICT, 'userName/email already in use', SCIM_ERROR_TYPES.uniqueness);
      }
      // Single-winner CAS on the version (updatedAt): a concurrent writer that already advanced the row loses (409).
      const cas = await this.prisma.user.updateMany({ where: { id: user.id, labId, updatedAt: user.updatedAt }, data: { email: next.email, firstName: next.firstName, lastName: next.lastName } });
      if (cas.count !== 1) throw new ScimException(HttpStatus.CONFLICT, 'the resource was modified concurrently', SCIM_ERROR_TYPES.mutability);
      return true;
    });
  }

  /** Map SCIM `active` onto a governed lifecycle transition (via the boundary). Terminal state cannot be reactivated. */
  private async applyActive(user: LoadedUser, desiredActive: boolean): Promise<{ outcome: ScimOutcome; changed: boolean }> {
    const labId = this.requireLab();
    const state = user.lifecycleState;
    return this.labContext.runLabScoped(labId, async () => {
      if (desiredActive) {
        if (state === UserLifecycleState.ACTIVE) return { outcome: 'no_op', changed: false };
        if (state === UserLifecycleState.SUSPENDED) return { outcome: 'reactivated', changed: (await this.lifecycle.reactivate(user.id, this.actor('SCIM active=true'))).changed };
        if (state === UserLifecycleState.PROVISIONED || state === UserLifecycleState.INVITED) return { outcome: 'activated', changed: (await this.lifecycle.activate(user.id, this.actor('SCIM active=true'))).changed };
        throw new ScimException(HttpStatus.CONFLICT, 'cannot reactivate a deprovisioned identity', SCIM_ERROR_TYPES.mutability);
      }
      if (state === UserLifecycleState.ACTIVE) return { outcome: 'suspended', changed: (await this.lifecycle.suspend(user.id, this.actor('SCIM active=false'))).changed };
      return { outcome: 'no_op', changed: false }; // already not login-enabled — benign no-op
    });
  }

  private assertVersion(ifMatch: string | undefined, updatedAt: Date): void {
    if (ifMatch && !versionMatches(ifMatch, updatedAt)) throw new ScimException(HttpStatus.PRECONDITION_FAILED, 'resource version does not match If-Match', SCIM_ERROR_TYPES.uniqueness);
  }

  private assertExternalIdUnchanged(supplied: string | undefined, current: string): void {
    if (supplied !== undefined && supplied.trim() !== '' && supplied.trim() !== current) {
      // Immutable mapping (R3/§4b): SCIM ops NEVER re-point an externalId. Fails closed, deterministically.
      throw new ScimException(HttpStatus.CONFLICT, 'externalId is immutable and cannot be reassigned', SCIM_ERROR_TYPES.mutability);
    }
  }

  private collectFromValueObject(value: Record<string, unknown>, attrs: { email?: string; firstName?: string; lastName?: string }, setActive: (a: boolean) => void, currentExternalId: string): void {
    if (typeof value.userName === 'string') attrs.email = value.userName.toLowerCase();
    if (typeof value.active === 'boolean') setActive(value.active);
    if (value.name && typeof value.name === 'object') {
      const n = value.name as Record<string, unknown>;
      if (typeof n.givenName === 'string') attrs.firstName = n.givenName;
      if (typeof n.familyName === 'string') attrs.lastName = n.familyName;
    }
    if (typeof value.externalId === 'string') this.assertExternalIdUnchanged(value.externalId, currentExternalId);
  }

  private mergeOutcome(attrChanged: boolean, life: { outcome: ScimOutcome; changed: boolean }): ScimOutcome {
    if (life.changed) return life.outcome; // a real transition dominates the coded outcome
    if (attrChanged) return 'updated';
    return 'no_op';
  }

  private actor(reason: string): LifecycleActor {
    return { reason }; // SCIM is a machine actor; the connector identity rides in ExecutionContext attribution
  }

  private parseEqFilter(filter?: string): { attr: 'userName' | 'externalId'; value: string } | undefined {
    if (!filter) return undefined;
    const m = filter.match(/^\s*(userName|externalId)\s+eq\s+"([^"]*)"\s*$/i);
    if (!m) throw new ScimException(HttpStatus.BAD_REQUEST, 'unsupported filter (baseline: userName|externalId eq "…")', SCIM_ERROR_TYPES.invalidValue);
    const attr = m[1].toLowerCase() === 'username' ? 'userName' : 'externalId';
    return { attr, value: m[2] };
  }

  private asString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }
  private asBoolean(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    throw new ScimException(HttpStatus.BAD_REQUEST, 'active must be a boolean', SCIM_ERROR_TYPES.invalidValue);
  }

  /** Best-effort coded SCIM audit — bounded operation/outcome codes ONLY; never the payload, token, password, or PHI. */
  private async recordSync(operation: ScimOperation, outcome: ScimOutcome, lifecycleChanged: boolean, userId: string): Promise<void> {
    await this.audit
      .record({ category: 'ADMINISTRATIVE', actionCode: 'IDENTITY_SCIM_SYNCED', resource: { type: 'User', id: userId }, outcome: { status: 'SUCCESS' }, producerModule: 'scim', metadata: { operation, outcome, lifecycleChanged } })
      .catch(() => undefined);
  }
}

/** A random, unusable placeholder secret (never NULL — Model C parity). SCIM performs no password management. */
function placeholderSecret(): string {
  return randomBytes(32).toString('base64url');
}
