import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ServicesCatalogService } from './services-catalog.service';
import { TaxesService } from '../taxes/taxes.service';

/**
 * Services & Taxes settings CRUD: create, update (edit price / rate), and
 * per-lab name uniqueness (legacy enforced a unique name on both). Gated on
 * DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Services & Taxes (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const services = new ServicesCatalogService(prisma);
  const taxes = new TaxesService(prisma);

  const tag = `st-${Date.now().toString(36)}`;
  let labId: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `ST ${tag}`, slug: `st-${tag}` } });
    labId = lab.id;
  });
  afterAll(async () => {
    await raw.service.deleteMany({ where: { labId } });
    await raw.tax.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('service: create, edit price (cents), reject duplicate name', () =>
    run(async () => {
      const svc = await services.create({ name: 'Pap Smear', code: 'PAP', price: 5000 });
      expect(svc.price).toBe(5000); // $50.00 stored as cents

      const edited = await services.update(svc.id, { price: 7500 });
      expect(edited.price).toBe(7500);

      await expect(services.create({ name: 'Pap Smear', code: 'PAP2', price: 100 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      const other = await services.create({ name: 'Biopsy', code: 'BIO', price: 12000 });
      await expect(services.update(other.id, { name: 'Pap Smear' })).rejects.toBeInstanceOf(ConflictException);
    }));

  it('tax: create, edit rate (basis points), reject duplicate name', () =>
    run(async () => {
      const gct = await taxes.create({ name: 'GCT', rateBasisPoints: 1500 });
      expect(gct.rateBasisPoints).toBe(1500); // 15.00% stored as basis points

      const edited = await taxes.update(gct.id, { rateBasisPoints: 1250 });
      expect(edited.rateBasisPoints).toBe(1250);

      await expect(taxes.create({ name: 'GCT', rateBasisPoints: 500 })).rejects.toBeInstanceOf(ConflictException);
    }));
});
