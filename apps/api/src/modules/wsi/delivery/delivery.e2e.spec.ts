import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { DERIVATIVE_OBJECT_STORE, DerivativeObjectStore } from '../storage/derivative-object-store';

/**
 * P5-5B-ii — full HTTP credential-separation + streaming, through Nest's pipeline. Gated on DATABASE_URL
 * (needs a migrated DB + full-app bootstrap); it proves the route-level behavior the service tests can't:
 * a delivery bearer streams bytes, a staff JWT alone cannot, a query token is ignored, and a missing
 * object maps to 404 — all with `Cache-Control: private, no-store`.
 */
// Opt-in gate — WSI_DELIVERY_E2E=1 means: "run only in an environment capable of bootstrapping the full
// application with a migrated DB and all required application dependencies". DATABASE_URL is NOT a usable
// signal here because the unit-test harness sets it universally (isolated test DB) while full-AppModule
// bootstrap is unreliable in that env. This suite skips cleanly unless the flag is set.
const describeIf = process.env.WSI_DELIVERY_E2E ? describe : describe.skip;

describeIf('Delivery artifact HTTP (e2e)', () => {
  let app: INestApplication;
  const raw = new PrismaClient();
  const slug = `wsi5b-${Date.now().toString(36)}`;
  const staffEmail = `staff-${slug}@e2e.test`;
  const password = 'E2eTestPassword1!';
  let labId: string;
  let staffCookie: string;
  let slideId: string;
  let descriptorKey: string;

  beforeAll(async () => {
    // Dynamic import so the SKIPPED suite (no DATABASE_URL) never drags the full app graph into the test
    // compiler; in CI (DATABASE_URL set) it loads normally, exactly like the other AppModule e2e suites.
    const { AppModule } = await import('../../../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-lab')
      .send({ labName: 'WSI 5B E2E', labSlug: slug, email: staffEmail, firstName: 'E2E', lastName: 'Admin', password })
      .expect(201);
    labId = reg.body.labId;
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: staffEmail, password }).expect(201);
    staffCookie = ((login.headers['set-cookie'] ?? []) as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

    // Seed a PUBLISHED generation with a real DZI descriptor object (no manifest needed for descriptor delivery).
    const patient = await raw.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'P', lastName: 'X' } });
    const record = await raw.record.create({ data: { labId, identifier: randomUUID(), patientId: patient.id } });
    const slide = await raw.digitalSlide.create({ data: { labId, recordId: record.id, slideUrl: '', availabilityStatus: 'DRAFT', sourceKind: 'UPLOAD' } });
    slideId = slide.id;
    const ing = await raw.slideIngestion.create({ data: { labId, slideId, sourceKind: 'UPLOAD', status: 'VERIFIED', sourceObjectKey: `k-${randomUUID()}`, sourceChecksum: 'c'.repeat(64) } });
    const job = await raw.slideProcessingJob.create({ data: { labId, ingestionId: ing.id, status: 'SUCCEEDED', workerId: 'w', attempt: 1 } as any });
    const gen = await raw.derivativeGeneration.create({ data: { labId, slideId, jobId: job.id, tileSourceType: 'DZI', status: 'PUBLISHED', sealed: true, verified: true, derivativeManifestChecksum: 'a'.repeat(64), publishedAt: new Date() } as any });
    descriptorKey = `slides/${labId}/${slideId}/derivatives/${gen.id}/dzi_descriptor`;
    await raw.slideAsset.create({ data: { labId, generationId: gen.id, role: 'DZI_DESCRIPTOR', storageKey: descriptorKey, checksum: 'd'.repeat(64), sizeBytes: 33 } });
    await raw.digitalSlide.update({ where: { id: slideId }, data: { publishedGenerationId: gen.id, availabilityStatus: 'PUBLISHED', publishedAt: new Date() } });

    const store = app.get<DerivativeObjectStore>(DERIVATIVE_OBJECT_STORE);
    await store.putImmutableObject(descriptorKey, Readable.from(Buffer.from('<Image TileSize="256" Overlap="1"/>')));
  });

  afterAll(async () => {
    if (labId) {
      await raw.deliverySession.deleteMany({ where: { labId } });
      await raw.slideAsset.deleteMany({ where: { labId } });
      await raw.$executeRaw`UPDATE "DigitalSlide" SET "publishedGenerationId" = NULL WHERE "labId" = ${labId}`;
      await raw.derivativeGeneration.deleteMany({ where: { labId } });
      await raw.slideProcessingJob.deleteMany({ where: { labId } });
      await raw.slideIngestion.deleteMany({ where: { labId } });
      await raw.digitalSlide.deleteMany({ where: { labId } });
      await raw.record.deleteMany({ where: { labId } });
      await raw.patient.deleteMany({ where: { labId } });
    }
    await raw.$disconnect().catch(() => undefined);
    await app?.close();
  });

  async function issueToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/wsi/slides/${slideId}/delivery-session`)
      .set('Cookie', staffCookie)
      .expect(201);
    return res.body.token as string;
  }

  it('issues a session (staff, super-admin) and streams the descriptor via a delivery bearer', async () => {
    const token = await issueToken();
    const res = await request(app.getHttpServer())
      .get('/api/v1/wsi/delivery/descriptor')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.text || res.body.toString()).toContain('<Image');
  });

  it('rejects a staff JWT cookie alone on an artifact route (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/wsi/delivery/descriptor').set('Cookie', staffCookie).expect(401);
  });

  it('ignores a token supplied in the query string (401)', async () => {
    const token = await issueToken();
    await request(app.getHttpServer()).get(`/api/v1/wsi/delivery/descriptor?token=${token}`).expect(401);
  });

  it('maps an out-of-range tile / missing artifact to 404', async () => {
    const token = await issueToken();
    // No TILE_PYRAMID asset registered → tile resolution 404s.
    await request(app.getHttpServer()).get('/api/v1/wsi/delivery/tiles/0/0/0').set('Authorization', `Bearer ${token}`).expect(404);
  });
});
