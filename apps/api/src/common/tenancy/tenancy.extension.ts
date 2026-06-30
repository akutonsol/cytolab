import { Prisma } from '@prisma/client';
import { LabContext, TenantStore } from './lab-context';

/**
 * Global multi-lab tenancy guard, implemented as a Prisma client extension.
 *
 * Reads are filtered to the current lab and writes are stamped with it,
 * automatically, for every model that carries a `labId` column. The lab id is
 * taken from request-scoped {@link LabContext} (sourced from the JWT) — never
 * from caller-supplied arguments — so a forgotten `where: { labId }` can no
 * longer leak another lab's rows.
 */

// Models that directly carry a labId column are tenant-scoped. Derived from the
// Prisma schema at load time so a newly added tenant model is covered without
// touching this file.
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'labId'))
    .map((m) => m.name),
);

// Models that ALSO carry a clientId column can be client-scoped for portal
// (external) requests. Derived the same way, so a new client-columned model is
// covered automatically. Any tenant model NOT in this set is refused outright in
// a portal request (Rule B: fail closed on tables we can't structurally
// client-scope), so a portal user can never reach it via a forgotten filter.
const CLIENT_SCOPED_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'clientId'))
    .map((m) => m.name),
);

// model name -> { relationField -> related model name }, used to walk nested
// create payloads and stamp tenant children (which the top-level op can't reach).
const RELATION_TARGETS: Record<string, Record<string, string>> = {};
for (const model of Prisma.dmmf.datamodel.models) {
  const relations: Record<string, string> = {};
  for (const field of model.fields) {
    if (field.kind === 'object') relations[field.name] = field.type;
  }
  RELATION_TARGETS[model.name] = relations;
}

export const isTenantModel = (model?: string): boolean =>
  !!model && TENANT_MODELS.has(model);

export const isClientScopedModel = (model?: string): boolean =>
  !!model && CLIENT_SCOPED_MODELS.has(model);

/**
 * A scope dimension to inject/stamp: a column name, the value to force, and a
 * predicate for which models carry that column. `labId` applies to every tenant
 * model; `clientId` applies only to client-columned models, and only for portal
 * requests. Generalising the two lets the same recursive stamping cover both.
 */
interface Scope {
  field: 'labId' | 'clientId';
  value: string;
  applies: (model: string) => boolean;
}

/**
 * Type helper for create payloads of tenant-scoped models. Callers omit `labId`
 * — the tenancy guard stamps it from request context at query time — while
 * every other field stays fully type-checked. Keeps services from ever handling
 * the lab id on writes.
 */
export function tenantCreate<T extends { labId?: unknown }>(data: Omit<T, 'labId'>): T {
  return data as T;
}

/**
 * Create-payload helper for PORTAL writes: omits both `labId` and `clientId` —
 * the tenancy guard stamps both from portal request context at query time, so a
 * portal caller can never set either via the body.
 */
export function portalCreate<T extends { labId?: unknown; clientId?: unknown }>(
  data: Omit<T, 'labId' | 'clientId'>,
): T {
  return data as T;
}

// Operations whose `where` filters rows. update/delete are included: with
// Prisma 5's GA extendedWhereUnique, a labId added alongside the unique key is a
// valid additional filter, so a cross-lab update/delete simply matches nothing.
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Recurse one model's relation fields, stamping any nested creates for the given scope. */
function stampRelations(model: string, data: any, scope: Scope): void {
  if (!data || typeof data !== 'object') return;
  const relations = RELATION_TARGETS[model] ?? {};
  for (const [field, target] of Object.entries(relations)) {
    const nested = data[field];
    if (nested && typeof nested === 'object') stampNestedWrite(target, nested, scope);
  }
}

/** Stamp the create-side of a nested write op (`create`/`createMany`/`connectOrCreate`/`upsert`). */
function stampNestedWrite(target: string, nested: any, scope: Scope): void {
  if (nested.create) {
    const items = Array.isArray(nested.create) ? nested.create : [nested.create];
    items.forEach((c: any) => stampCreate(target, c, scope));
  }
  if (nested.createMany?.data) {
    const rows = nested.createMany.data;
    (Array.isArray(rows) ? rows : [rows]).forEach((r: any) => stampCreate(target, r, scope));
  }
  if (nested.connectOrCreate) {
    const items = Array.isArray(nested.connectOrCreate)
      ? nested.connectOrCreate
      : [nested.connectOrCreate];
    items.forEach((i: any) => i?.create && stampCreate(target, i.create, scope));
  }
  if (nested.upsert) {
    const items = Array.isArray(nested.upsert) ? nested.upsert : [nested.upsert];
    items.forEach((u: any) => u?.create && stampCreate(target, u.create, scope));
  }
}

/** Stamp a scope's column onto a create payload (where it applies) and recurse into nested creates. */
function stampCreate(model: string, data: any, scope: Scope): void {
  if (!data || typeof data !== 'object') return;
  if (scope.applies(model)) data[scope.field] = scope.value;
  stampRelations(model, data, scope);
}

export interface ScopeParams {
  model?: string;
  operation: string;
  args: any;
}

/**
 * Pure core of the tenancy guard: returns the args that should actually be sent
 * to the database for the given context. Exported so the behaviour can be
 * tested without a database. Throws if a tenant model is touched with no lab
 * context — failing closed rather than leaking across labs.
 */
export function scopeArgs({ model, operation, args }: ScopeParams, store: TenantStore | undefined): any {
  // System/unscoped context: pass through untouched (login, refresh, bootstrap).
  if (store?.system) return args;
  if (!isTenantModel(model)) return args;

  const labId = store?.labId;
  if (!labId) {
    throw new Error(
      `Tenancy guard: refusing to run ${model}.${operation} with no lab context. ` +
        `Cross-lab operations must be wrapped in LabContext.runSystem().`,
    );
  }

  // Lab scope always applies to a tenant model.
  const scopes: Scope[] = [{ field: 'labId', value: labId, applies: isTenantModel }];

  // Portal (external client) requests are ADDITIONALLY client-scoped.
  if (store?.portal) {
    const clientId = store.clientId;
    if (!clientId) {
      throw new Error(
        `Tenancy guard: refusing to run ${model}.${operation} in a portal request with no client context.`,
      );
    }
    // Rule B — fail closed: a portal request may only touch tables we can
    // structurally client-scope. Anything else (ResultSheet, Report, …) is
    // refused outright so it can never leak via a forgotten where clause.
    if (!isClientScopedModel(model)) {
      throw new Error(
        `Tenancy guard: refusing portal access to ${model}.${operation} — ` +
          `${model} is not client-scoped. Reach it via an owned-record check, not directly.`,
      );
    }
    scopes.push({ field: 'clientId', value: clientId, applies: isClientScopedModel });
  }

  const a: any = args ?? {};
  const injectWhere = (target: any) => {
    for (const s of scopes) if (s.applies(model!)) target[s.field] = s.value;
  };

  if (WHERE_OPS.has(operation)) {
    a.where = { ...(a.where ?? {}) };
    injectWhere(a.where);
    // A row must never be moved to another lab/client via update data.
    if ((operation === 'update' || operation === 'updateMany') && a.data) {
      for (const s of scopes) {
        delete a.data[s.field];
        stampRelations(model!, a.data, s);
      }
    }
  } else if (operation === 'create') {
    a.data = a.data ?? {};
    for (const s of scopes) stampCreate(model!, a.data, s);
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = a.data;
    for (const s of scopes) {
      if (Array.isArray(rows)) rows.forEach((r: any) => stampCreate(model!, r, s));
      else if (rows) stampCreate(model!, rows, s);
    }
  } else if (operation === 'upsert') {
    a.where = { ...(a.where ?? {}) };
    injectWhere(a.where);
    a.create = a.create ?? {};
    for (const s of scopes) stampCreate(model!, a.create, s);
    if (a.update) {
      for (const s of scopes) {
        delete a.update[s.field];
        stampRelations(model!, a.update, s);
      }
    }
  }

  return a;
}

export function tenancyExtension(labContext: LabContext) {
  return Prisma.defineExtension({
    name: 'lab-tenancy',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs({ model, operation, args }, labContext.getStore()));
        },
      },
    },
  });
}
