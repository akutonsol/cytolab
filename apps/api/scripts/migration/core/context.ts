/**
 * Shared ETL run context, threaded through every stage.
 */
import type { PrismaClient } from '@prisma/client';
import type { LegacySource } from './legacy-source';
import type { IdMap } from './id-map';
import type { ReconRow } from './reconcile';

export interface EtlContext {
  legacy: LegacySource;
  prisma: PrismaClient;
  idMap: IdMap;
  /** The CytoLabs Lab id (set by the lab-seed stage). */
  labId: string;
  /** Default account/workspace ids under the lab (set by the lab-seed stage). */
  accountId: string;
  workspaceId: string;
  /** Transform-only: skip all DB writes, still stream + reconcile. */
  dryRun: boolean;
  /** Incremental (nightly) mode: only rows with dateupdated > since. */
  incremental: boolean;
  log: (msg: string) => void;
  recon: ReconRow[];
}

export type StageFn = (ctx: EtlContext) => Promise<void>;
