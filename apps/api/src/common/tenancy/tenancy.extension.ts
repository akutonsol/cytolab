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

/**
 * Type helper for create payloads of tenant-scoped models. Callers omit `labId`
 * — the tenancy guard stamps it from request context at query time — while
 * every other field stays fully type-checked. Keeps services from ever handling
 * the lab id on writes.
 */
export function tenantCreate<T extends { labId?: unknown }>(data: Omit<T, 'labId'>): T {
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

/** Recurse one model's relation fields, stamping any nested tenant-model creates. */
function stampRelations(model: string, data: any, labId: string): void {
  if (!data || typeof data !== 'object') return;
  const relations = RELATION_TARGETS[model] ?? {};
  for (const [field, target] of Object.entries(relations)) {
    const nested = data[field];
    if (nested && typeof nested === 'object') stampNestedWrite(target, nested, labId);
  }
}

/** Stamp the create-side of a nested write op (`create`/`createMany`/`connectOrCreate`/`upsert`). */
function stampNestedWrite(target: string, nested: any, labId: string): void {
  if (nested.create) {
    const items = Array.isArray(nested.create) ? nested.create : [nested.create];
    items.forEach((c: any) => stampCreate(target, c, labId));
  }
  if (nested.createMany?.data) {
    const rows = nested.createMany.data;
    (Array.isArray(rows) ? rows : [rows]).forEach((r: any) => stampCreate(target, r, labId));
  }
  if (nested.connectOrCreate) {
    const items = Array.isArray(nested.connectOrCreate)
      ? nested.connectOrCreate
      : [nested.connectOrCreate];
    items.forEach((i: any) => i?.create && stampCreate(target, i.create, labId));
  }
  if (nested.upsert) {
    const items = Array.isArray(nested.upsert) ? nested.upsert : [nested.upsert];
    items.forEach((u: any) => u?.create && stampCreate(target, u.create, labId));
  }
}

/** Stamp labId onto a create payload (if the model is tenant-scoped) and recurse into nested creates. */
function stampCreate(model: string, data: any, labId: string): void {
  if (!data || typeof data !== 'object') return;
  if (isTenantModel(model)) data.labId = labId;
  stampRelations(model, data, labId);
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

  const a: any = args ?? {};

  if (WHERE_OPS.has(operation)) {
    a.where = { ...(a.where ?? {}), labId };
    // A row must never be moved to another lab via update data.
    if ((operation === 'update' || operation === 'updateMany') && a.data) {
      delete a.data.labId;
      stampRelations(model!, a.data, labId);
    }
  } else if (operation === 'create') {
    a.data = a.data ?? {};
    stampCreate(model!, a.data, labId);
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = a.data;
    if (Array.isArray(rows)) rows.forEach((r: any) => stampCreate(model!, r, labId));
    else if (rows) stampCreate(model!, rows, labId);
  } else if (operation === 'upsert') {
    a.where = { ...(a.where ?? {}), labId };
    a.create = a.create ?? {};
    stampCreate(model!, a.create, labId);
    if (a.update) {
      delete a.update.labId;
      stampRelations(model!, a.update, labId);
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
