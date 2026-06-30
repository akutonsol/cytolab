import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  /** The lab (tenant) the current request is scoped to. Populated from the JWT, never the body. */
  labId?: string;
  /** When true, tenancy is intentionally bypassed (auth/bootstrap cross-lab lookups only). */
  system?: boolean;
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
   */
  runSystem<T>(fn: () => T): T {
    return this.als.run({ system: true }, fn);
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
}
