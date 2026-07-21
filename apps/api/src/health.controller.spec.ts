/**
 * Program 4 · D-1 — Health probe contract.
 * Liveness is fast + non-sensitive; readiness does a cheap DB ping (503 on failure);
 * both routes are @Public (auth-exempt). SkipThrottle is applied at the class level.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './common/decorators/public.decorator';
import { HealthController } from './health.controller';
import type { PrismaService } from './database/prisma.service';

describe('HealthController (D-1)', () => {
  it('check(): fast liveness, no sensitive fields', () => {
    const controller = new HealthController({} as unknown as PrismaService);
    const res = controller.check();
    expect(res.status).toBe('ok');
    expect(res).not.toHaveProperty('env');
    expect(res).not.toHaveProperty('databaseUrl');
  });

  it('ready(): returns ready when the DB responds (SELECT 1)', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]) };
    const controller = new HealthController(prisma as unknown as PrismaService);
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('ready(): 503 when the DB is unreachable', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('down')) };
    const controller = new HealthController(prisma as unknown as PrismaService);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('both routes are @Public (auth-exempt)', () => {
    const reflector = new Reflector();
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, HealthController.prototype.check)).toBe(true);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, HealthController.prototype.ready)).toBe(true);
  });
});
