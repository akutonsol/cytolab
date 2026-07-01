import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { LabCodesService } from './lab-codes.service';

/**
 * Lab codes settings CRUD: create, update (edit), and per-lab code uniqueness
 * (legacy enforced a unique code). Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Lab codes (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const labCodes = new LabCodesService(prisma);

  const tag = `lc-${Date.now().toString(36)}`;
  let labId: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `LC ${tag}`, slug: `lc-${tag}` } });
    labId = lab.id;
  });
  afterAll(async () => {
    await raw.labCode.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('creates, edits, and rejects a duplicate code within the lab', () =>
    run(async () => {
      const created = await labCodes.create({ code: 'CBL', region: 'Kingston' });
      expect(created.code).toBe('CBL');
      expect(created.region).toBe('Kingston');

      const edited = await labCodes.update(created.id, { region: 'Montego Bay' });
      expect(edited.region).toBe('Montego Bay');

      // A second CBL in the same lab is rejected.
      await expect(labCodes.create({ code: 'CBL', region: 'x' })).rejects.toBeInstanceOf(ConflictException);

      // A different code is fine, and updating it to an existing code also conflicts.
      const other = await labCodes.create({ code: 'CYND' });
      await expect(labCodes.update(other.id, { code: 'CBL' })).rejects.toBeInstanceOf(ConflictException);

      const all = await labCodes.findAll();
      expect(all.map((c) => c.code).sort()).toEqual(['CBL', 'CYND']);
    }));
});
