import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { LabContext, TenantStore } from '../tenancy/lab-context';
import {
  computeDeviceId,
  getClientIp,
  parseUserAgent,
} from '../../modules/security/request-context.util';
import {
  ExecutionAttribution,
  ExecutionActor,
  ExecutionOrganization,
  ExecutionSource,
  PrincipalLike,
} from './execution-context.types';
import {
  generateCorrelationId,
  generateExecutionId,
  generateRequestId,
  resolveInboundCorrelationId,
} from './correlation.util';
import { resolveActor, resolveOrganization } from './attribution-resolution';

export class ExecutionContextReplacementError extends Error {
  constructor(what: string) {
    super(
      `A nested execution context may not replace ${what}; it may only add execution ` +
        `metadata (and declare delegation via onBehalfOfActorId).`,
    );
    this.name = 'ExecutionContextReplacementError';
  }
}

/** Options for a nested child execution (see runChild). */
export interface ChildExecutionOptions {
  jobName?: string;
  executionId?: string;
  source?: Extract<ExecutionSource, 'job' | 'system'>;
  /** Genuine delegation: the real actor is kept; this is recorded as acted-on-behalf-of. */
  onBehalfOfActorId?: string;
}

/** Options for a top-level background job / system execution (no HTTP request fields). */
export interface JobExecutionOptions {
  jobName: string;
  executionId?: string;
  correlationId?: string;
  /** Scope the job to a lab, or leave undefined for a system-scoped job (no fabricated tenant). */
  labId?: string;
  /** For system-scoped jobs, whether the scope is SYSTEM (default) or CROSS_LAB. */
  organizationScope?: 'SYSTEM' | 'CROSS_LAB';
}

/**
 * Program 2 · P2-2 — the attribution accessor/mutator over the single shared tenant store.
 *
 * Reads and writes the SAME AsyncLocalStorage store the tenancy guard uses (via LabContext);
 * it introduces no second context. It records who/where/request/execution so a future audit
 * event (P2-3) inherits trusted attribution automatically. It performs NO authorization, holds
 * NO PHI, and does not touch the Audit module.
 */
@Injectable()
export class ExecutionContextService {
  constructor(private readonly labContext: LabContext) {}

  // --- Accessors -----------------------------------------------------------

  getAttribution(): ExecutionAttribution | undefined {
    return this.labContext.getStore()?.attribution;
  }

  getCorrelationId(): string | undefined {
    return this.getAttribution()?.correlationId;
  }

  getRequestId(): string | undefined {
    return this.getAttribution()?.request?.requestId;
  }

  getActor(): ExecutionActor | undefined {
    return this.getAttribution()?.actor;
  }

  getOrganization(): ExecutionOrganization | undefined {
    return this.getAttribution()?.organization;
  }

  /**
   * P2-5B — the request-local PHI-access dedupe seen-set for the current execution, lazily created
   * on the current store. Returns undefined when no store is open (outside a request/execution),
   * so the dedup helper falls back to emit-always rather than crash. This is request-local scratch
   * space, not attribution and not authorization; it is auto-collected when the store ends.
   */
  getPhiAccessSeenSet(): Set<string> | undefined {
    const store = this.labContext.getStore();
    if (!store) return undefined;
    if (!store.phiAccessSeen) store.phiAccessSeen = new Set<string>();
    return store.phiAccessSeen;
  }

  // --- HTTP population (middleware, then interceptor) ----------------------

  /**
   * Establish transport attribution at the start of an HTTP/portal request. Resolves the
   * correlation id (reuse a valid inbound id, generate when absent, reject malformed), mints a
   * requestId, and captures the request fingerprint. Actor/organization are bound later, once
   * authentication has populated the principal. No-op if no store is open.
   */
  initHttpRequest(req: Request): void {
    const store = this.labContext.getStore();
    if (!store) return;
    const correlationId = resolveInboundCorrelationId(
      req.headers['x-correlation-id'] as string | string[] | undefined,
    );
    store.attribution = {
      correlationId,
      request: {
        requestId: generateRequestId(),
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
        httpMethod: req.method,
      },
      execution: { source: 'http' },
    };
  }

  /**
   * Bind trusted actor + organization onto the current request once the principal is known
   * (interceptor, post-guard). Also completes the request fingerprint (device id from the
   * authenticated actor, normalized route template) and refines the source to 'portal' for
   * portal principals. Identity comes only from the principal, never from the request payload.
   */
  bindPrincipal(
    principal: PrincipalLike | undefined,
    routeTemplate?: string,
  ): void {
    const store = this.labContext.getStore();
    if (!store?.attribution) return;
    const attribution = store.attribution;

    const actor = resolveActor(principal);
    attribution.actor = actor;
    attribution.organization = resolveOrganization(principal);

    if (principal?.sessionId) {
      attribution.session = {
        sessionId: principal.sessionId,
        sessionKind: principal.kind ?? undefined,
      };
    }
    if (principal?.kind === 'portal') attribution.execution.source = 'portal';

    if (attribution.request) {
      if (routeTemplate) attribution.request.apiRoute = routeTemplate;
      // Device id is stable per (actor, UA, IP); only meaningful once we know the actor.
      if (actor.actorId) {
        attribution.request.deviceId = computeDeviceId(
          actor.actorId,
          attribution.request.userAgent,
          attribution.request.ipAddress ?? '0.0.0.0',
        );
      }
    }
  }

  // --- Non-HTTP execution --------------------------------------------------

  /**
   * Run a background job in a fresh scope with job attribution: a mandatory executionId +
   * correlationId, jobName, source='job', and NO fabricated HTTP request fields. System-scoped
   * unless a labId is given; never invents a tenant.
   */
  async runJob<T>(opts: JobExecutionOptions, fn: () => T | Promise<T>): Promise<T> {
    const tenancy: TenantStore = opts.labId
      ? { labId: opts.labId }
      : { system: true };
    const organization: ExecutionOrganization = opts.labId
      ? { scope: 'LAB', labId: opts.labId }
      : { scope: opts.organizationScope ?? 'SYSTEM' };

    const store: TenantStore = {
      ...tenancy,
      attribution: {
        correlationId: opts.correlationId ?? generateCorrelationId(),
        organization,
        actor: { actorType: 'SYSTEM' },
        execution: {
          source: 'job',
          jobName: opts.jobName,
          executionId: opts.executionId ?? generateExecutionId(),
        },
      },
    };
    return this.labContext.runScoped(store, fn);
  }

  /**
   * Run an explicit system execution (source='system') in a system-scoped fresh store. Like
   * {@link runJob} but without a jobName; for platform-internal work that is not a scheduled job.
   */
  async runSystemExecution<T>(
    opts: { executionId?: string; correlationId?: string; organizationScope?: 'SYSTEM' | 'CROSS_LAB' },
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const store: TenantStore = {
      system: true,
      attribution: {
        correlationId: opts.correlationId ?? generateCorrelationId(),
        organization: { scope: opts.organizationScope ?? 'SYSTEM' },
        actor: { actorType: 'SYSTEM' },
        execution: {
          source: 'system',
          executionId: opts.executionId ?? generateExecutionId(),
        },
      },
    };
    return this.labContext.runScoped(store, fn);
  }

  /**
   * Run a NESTED child execution. The child inherits the parent's tenancy, actor, organization,
   * session, and correlation id unchanged; it may only ADD execution metadata (jobName/
   * executionId/source) and declare delegation via onBehalfOfActorId. It can never silently
   * replace actor, lab, or organization — doing so throws.
   */
  async runChild<T>(opts: ChildExecutionOptions, fn: () => T | Promise<T>): Promise<T> {
    const parent = this.labContext.getStore();
    if (!parent?.attribution) {
      throw new ExecutionContextReplacementError(
        'a child of an execution with no attribution (start a job/system execution instead)',
      );
    }
    const parentAttr = parent.attribution;

    const childActor: ExecutionActor | undefined = parentAttr.actor
      ? { ...parentAttr.actor }
      : undefined;
    if (opts.onBehalfOfActorId) {
      if (!childActor) {
        throw new ExecutionContextReplacementError(
          'the actor (delegation requires an existing actor to act on behalf of another)',
        );
      }
      childActor.onBehalfOfActorId = opts.onBehalfOfActorId;
    }

    const childStore: TenantStore = {
      // Carry tenancy forward verbatim — a child cannot change lab/portal/system scope.
      labId: parent.labId,
      clientId: parent.clientId,
      portal: parent.portal,
      system: parent.system,
      attribution: {
        correlationId: parentAttr.correlationId, // same trace across the nesting
        organization: parentAttr.organization,
        actor: childActor,
        session: parentAttr.session,
        request: parentAttr.request,
        execution: {
          source: opts.source ?? parentAttr.execution.source,
          jobName: opts.jobName ?? parentAttr.execution.jobName,
          executionId: opts.executionId ?? generateExecutionId(),
        },
      },
    };
    return this.labContext.runScoped(childStore, fn);
  }
}
