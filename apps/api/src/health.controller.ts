import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './database/prisma.service';

/**
 * Orchestrator health probes. Public (no auth) and throttle-exempt so frequent
 * liveness/readiness checks are never rate-limited. Fast and non-sensitive.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness: the process is up. No I/O; returns immediately.
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'cytolab-api', time: new Date().toISOString() };
  }

  // Readiness: the process can serve — a cheap DB round-trip (SELECT 1).
  // `$queryRawUnsafe` bypasses the tenancy guard (which wraps $allModels only), so
  // no lab context is required. Returns 503 if the database is unreachable.
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
  }
}
