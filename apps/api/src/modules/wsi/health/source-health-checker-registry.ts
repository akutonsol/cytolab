import { Inject, Injectable } from '@nestjs/common';
import { SOURCE_HEALTH_CHECKERS, type IngestionSourceHealthChecker, type ResolvedIngestionSource } from './source-health';

/**
 * Program 5C · C5 — STATIC registry of transport health checkers (filesystem, dicomweb). Compile-time DI
 * providers under SOURCE_HEALTH_CHECKERS; no dynamic/plugin loading, no DB-driven instantiation. A checker is
 * chosen by `supports(source)` (transport kind).
 */
@Injectable()
export class SourceHealthCheckerRegistry {
  constructor(@Inject(SOURCE_HEALTH_CHECKERS) private readonly checkers: IngestionSourceHealthChecker[]) {}

  resolve(source: ResolvedIngestionSource): IngestionSourceHealthChecker | undefined {
    return this.checkers.find((c) => c.supports(source));
  }
}
