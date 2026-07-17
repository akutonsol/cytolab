import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExecutionAttribution } from '../execution-context/execution-context.types';

export interface TenantStore {
  /** The lab (tenant) the current request is scoped to. Populated from the JWT, never the body. */
  labId?: string;
  /**
   * The client (sub-tenant) a PORTAL request is scoped to. Populated from the
   * portal JWT, never the body. Only set for external/portal requests; when set,
   * the tenancy guard additionally filters/stamps every client-scoped model by
   * this clientId and refuses any tenant model that cannot be client-scoped.
   */
  clientId?: string;
  /** True for external client-portal requests (enables client-scoping + Rule B fail-close). */
  portal?: boolean;
  /** When true, tenancy is intentionally bypassed (auth/bootstrap cross-lab lookups only). */
  system?: boolean;
  /**
   * P2-2 execution attribution (who/where/request/execution). Populated post-authentication
   * by the execution-context middleware/interceptor and by job/system execution helpers.
   * ATTRIBUTION ONLY — the tenancy guard ignores it and it never affects permissions. Optional
   * so every existing code path (which never sets it) is unaffected.
   */
  attribution?: ExecutionAttribution;
  /**
   * P2-5B request-local scratch: the set of PHI-access dedupe keys already emitted in this
   * execution. Request-scoped (lives and dies with this AsyncLocalStorage store — no global state,
   * no timer, no cross-request leakage). Owned by the PHI-access dedup helper; NOT attribution and
   * NOT used for authorization. Optional so every existing path is unaffected.
   */
  phiAccessSeen?: Set<string>;
}

/**
 * Request-scoped tenant context backed by AsyncLocalStorage.
 *
 * The store is established once per request by {@link LabContextMiddleware} and
 * the authenticated `labId` is bound onto it after the JWT guard runs (by
 * {@link LabContextInterceptor}). The Prisma tenancy extension reads `labId`
 * from here, so no service ever has to pass it manually — and a caller can
 * never smuggle a `labId` in via the request body.
 */
@Injectable()
export class LabContext {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** Establish a fresh per-request store and run the rest of the request inside it. */
  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  /**
   * Run a callback with tenancy disabled. Reserved for genuinely cross-lab work
   * that has no authenticated lab yet — login, refresh, and lab bootstrap.
   *
   * Awaits `fn` *inside* the AsyncLocalStorage scope, so a lazily-executed
   * PrismaPromise still runs in the system context even if the caller awaits the
   * result outside it. (Returning the promise unawaited would let the query
   * execute after the scope exited, and the guard would refuse it.)
   */
  async runSystem<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.als.run({ system: true }, async () => await fn());
  }

  /**
   * Run a callback in a brand-new store (awaiting inside the scope, like {@link runSystem}, so a
   * lazily-executed PrismaPromise still runs inside it). Additive helper used by the P2-2
   * execution-context service to open job / system / nested-child scopes with attribution. The
   * tenancy semantics come entirely from the tenancy fields on `store` (labId/system/portal),
   * exactly as with {@link run}; attribution rides alongside and never affects them.
   */
  async runScoped<T>(store: TenantStore, fn: () => T | Promise<T>): Promise<T> {
    return this.als.run(store, async () => await fn());
  }

  getStore(): TenantStore | undefined {
    return this.als.getStore();
  }

  /** The active lab id, or undefined when there is no scope (or a system scope). */
  getLabId(): string | undefined {
    const store = this.als.getStore();
    return store?.system ? undefined : store?.labId;
  }

  /** Bind the authenticated lab id onto the current request's store. */
  setLabId(labId: string): void {
    const store = this.als.getStore();
    if (store) store.labId = labId;
  }

  /**
   * Bind a portal (external) request's scope: both lab and client, with the
   * portal flag set so the tenancy guard additionally client-scopes every query
   * and fails closed (Rule B) on any table it can't client-scope.
   */
  setPortalContext(labId: string, clientId: string): void {
    const store = this.als.getStore();
    if (store) {
      store.labId = labId;
      store.clientId = clientId;
      store.portal = true;
    }
  }

  /** The active client id for a portal request, or undefined. */
  getClientId(): string | undefined {
    const store = this.als.getStore();
    return store?.system ? undefined : store?.clientId;
  }

  /**
   * Run a callback in a fresh LAB-ONLY scope (lab kept, portal/client dropped).
   * Used after a portal request has *structurally proven* it owns a record, to
   * read that record's non-client-scoped chain (e.g. ResultSheet/Report) which
   * Rule B otherwise refuses. Awaits inside the scope (see runSystem) so a lazy
   * PrismaPromise still executes in the lab-only context.
   */
  async runLabScoped<T>(labId: string, fn: () => T | Promise<T>): Promise<T> {
    return this.als.run({ labId }, async () => await fn());
  }
}
