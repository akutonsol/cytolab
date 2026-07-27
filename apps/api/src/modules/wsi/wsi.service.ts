import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/wsi.dto';
import { ListSlidesQueryDto } from './dto/list-slides-query.dto';
import { paginate } from '../../common/dto/pagination.dto';
import { deriveSlideLifecycle, lifecycleWhere } from './slide-lifecycle';
import { AuditRecorder } from '../audit/audit-recorder.service';

// P5-4 Phase B Part 2: `slideUrl` is a retained legacy DB column (see schema) but is NOT part of the
// supported read contract — viewability derives from a published generation via the delivery boundary,
// never from `slideUrl`. It is therefore excluded from the response projection.
// P5-5: `publishedGenerationId` + generation statuses are selected ONLY to derive a truthful lifecycle
// (see slide-lifecycle.ts) and are stripped from the response by `toRow` — they are never exposed raw.
const slideSelect = {
  id: true, format: true, tileSourceType: true, magnification: true, stain: true, scanner: true,
  fileSizeBytes: true, uploadedById: true, uploadedAt: true, recordId: true,
  publishedGenerationId: true,
  // P5-7: persisted specimen anchor (nullable). Identity only — never image bytes/storage. A null
  // specimenId is a genuinely record-level slide and is surfaced as such; never inferred into a specimen.
  specimenId: true,
  specimen: { select: { id: true, type: true, label: true } },
  record: {
    select: {
      id: true, labNumber: true, identifier: true, formType: true,
      patient: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
    },
  },
  generations: { select: { status: true, sealed: true, verified: true } },
  annotations: { select: { id: true, x: true, y: true, label: true, color: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DigitalSlideSelect;

type Row = Prisma.DigitalSlideGetPayload<{ select: typeof slideSelect }>;

@Injectable()
export class WsiService {
  constructor(private prisma: PrismaService, private audit: AuditRecorder) {}

  /** P2-5C: emit a successful single-subject slide PHI read (best-effort). patientRef from the
   *  slide's already-selected record.patient.id — no extra query. */
  private async auditSlideRead(slide: Row) {
    const patientId = slide.record?.patient?.id;
    if (!patientId) return;
    await this.audit.recordPhiRead({
      patientId,
      accessSurface: 'slide',
      accessMode: 'view',
      producerModule: 'wsi',
      resource: { type: 'DigitalSlide', id: slide.id },
    });
  }

  private toRow(s: Row) {
    // Truthful lifecycle from authoritative persisted state; publishedGenerationId + generations are used
    // for derivation only and NOT spread into the response (no raw generation state / storage internals).
    const lifecycle = deriveSlideLifecycle({ publishedGenerationId: s.publishedGenerationId ?? null, generations: s.generations });
    return {
      id: s.id,
      format: s.format,
      tileSourceType: s.tileSourceType,
      magnification: s.magnification,
      stain: s.stain,
      scanner: s.scanner,
      fileSizeBytes: s.fileSizeBytes,
      uploadedById: s.uploadedById,
      uploadedAt: s.uploadedAt,
      recordId: s.recordId,
      // P5-7: truthful persisted specimen identity (or null for a record-level slide). Never fabricated.
      specimenId: s.specimenId ?? null,
      specimen: s.specimen ?? null,
      record: s.record,
      annotations: s.annotations,
      patientName: s.record?.patient ? `${s.record.patient.firstName} ${s.record.patient.lastName}`.trim() : '—',
      labNo: s.record ? (s.record.labNumber ?? s.record.identifier) : '—',
      annotationCount: s.annotations.length,
      lifecycle,
    };
  }

  // ── Slides ───────────────────────────────────────────────────────────────
  // P5-4 Phase B Part 2: the legacy paste-URL `createSlide` write path was retired. Slides are created
  // only through the authenticated ingestion pipeline (SlideIngestionService), which sets the retained
  // legacy `slideUrl` column to the '' compatibility value. Read/list paths below are unchanged.

  /** Latest slide for a record, or null. */
  async getByRecord(recordId: string) {
    const slide = await this.prisma.digitalSlide.findFirst({ where: { recordId }, orderBy: { uploadedAt: 'desc' }, select: slideSelect });
    if (!slide) return null;
    await this.auditSlideRead(slide);
    return this.toRow(slide);
  }

  /**
   * All slides for a record — METADATA ONLY (no slideUrl), latest first. For composition
   * by the Sign-Out aggregate; the viewer remains the sole owner of image delivery. Owned
   * here so slide query logic is never duplicated elsewhere.
   */
  async listByRecordMeta(recordId: string) {
    return this.prisma.digitalSlide.findMany({
      where: { recordId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true, format: true, magnification: true, stain: true, scanner: true,
        fileSizeBytes: true, uploadedAt: true,
        // P5-7: persisted specimen anchor for case/sign-out grouping (identity only, still no slideUrl/bytes).
        specimenId: true,
        specimen: { select: { id: true, type: true, label: true } },
      },
    });
  }

  /**
   * P5-5 — tenant-scoped slide discovery: server-side filter → deterministic order → paginate. Tenant
   * scoping is applied automatically by the tenancy extension (labId from LabContext, never the request).
   * Discovery requires record:view; results carry a truthful lifecycle but never image bytes/storage keys.
   */
  async list(query: ListSlidesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildSlideWhere(query);
    const dir: Prisma.SortOrder = query.sort === 'oldest' ? 'asc' : 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.digitalSlide.findMany({
        where,
        select: slideSelect,
        orderBy: [{ uploadedAt: dir }, { id: 'asc' }], // deterministic secondary key → stable pagination
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.digitalSlide.count({ where }),
    ]);
    // Enterprise audit (P2-5D): aggregate PHI slide-list read (exposes patient identifiers).
    await this.audit.recordPhiList({ accessSurface: 'list', producerModule: 'wsi', resultCount: rows.length, resourceType: 'SlideList' });
    return paginate(rows.map((s) => this.toRow(s)), total, page, pageSize);
  }

  /** Build the (tenant-scoped-by-extension) filter + free-text where for slide discovery. */
  private buildSlideWhere(query: ListSlidesQueryDto): Prisma.DigitalSlideWhereInput {
    const and: Prisma.DigitalSlideWhereInput[] = [];
    if (query.recordId) and.push({ recordId: query.recordId });
    // P5-7: narrow additive specimen filter (analogous to recordId). Tenant scoping still applies via the
    // extension; a caller can only ever match specimens on slides already visible under their record scope.
    if (query.specimenId) and.push({ specimenId: query.specimenId });
    if (query.stain) and.push({ stain: query.stain });
    if (query.scanner) and.push({ scanner: query.scanner });
    if (query.format) and.push({ format: query.format });
    if (query.tileSourceType) and.push({ tileSourceType: query.tileSourceType as Prisma.DigitalSlideWhereInput['tileSourceType'] });
    if (query.status) and.push(lifecycleWhere(query.status));
    const q = query.q?.trim();
    if (q) {
      // Multi-token: AND across tokens, OR across fields (mirrors the global-search convention). Each token
      // must appear in some field — patient name, record lab/accession number, stain, scanner, or format.
      for (const tok of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
        and.push({
          OR: [
            { stain: { contains: tok, mode: 'insensitive' } },
            { scanner: { contains: tok, mode: 'insensitive' } },
            { format: { contains: tok, mode: 'insensitive' } },
            { record: { OR: [
              { labNumber: { contains: tok, mode: 'insensitive' } },
              { identifier: { contains: tok, mode: 'insensitive' } },
              { patient: { is: { OR: [
                { firstName: { contains: tok, mode: 'insensitive' } },
                { lastName: { contains: tok, mode: 'insensitive' } },
              ] } } },
            ] } },
          ],
        });
      }
    }
    return and.length ? { AND: and } : {};
  }

  async summary() {
    const [totalSlides, recordGroups, totalAnnotations] = await Promise.all([
      this.prisma.digitalSlide.count(),
      this.prisma.digitalSlide.findMany({ distinct: ['recordId'], select: { recordId: true } }),
      this.prisma.slideAnnotation.count(),
    ]);
    return { totalSlides, recordsWithSlides: recordGroups.length, totalAnnotations };
  }

  async detail(slideId: string) {
    const slide = await this.prisma.digitalSlide.findFirst({ where: { id: slideId }, select: slideSelect });
    if (!slide) throw new NotFoundException('Slide not found');
    await this.auditSlideRead(slide);
    return this.toRow(slide);
  }

  async remove(slideId: string) {
    const slide = await this.prisma.digitalSlide.findFirst({ where: { id: slideId }, select: { id: true } });
    if (!slide) throw new NotFoundException('Slide not found');
    await this.prisma.digitalSlide.delete({ where: { id: slideId } });
    return { id: slideId, deleted: true };
  }

  // ── Annotations ──────────────────────────────────────────────────────────
  async addAnnotation(slideId: string, dto: CreateAnnotationDto, userId: string) {
    const slide = await this.prisma.digitalSlide.findFirst({ where: { id: slideId }, select: { id: true } });
    if (!slide) throw new NotFoundException('Slide not found');
    return this.prisma.slideAnnotation.create({
      data: tenantCreate<Prisma.SlideAnnotationUncheckedCreateInput>({
        slideId, x: dto.x, y: dto.y, label: dto.label, color: dto.color || '#4F46E5', createdById: userId,
      }),
      select: { id: true, x: true, y: true, label: true, color: true, createdAt: true },
    });
  }

  async updateAnnotation(annotationId: string, dto: UpdateAnnotationDto) {
    const a = await this.prisma.slideAnnotation.findFirst({ where: { id: annotationId }, select: { id: true } });
    if (!a) throw new NotFoundException('Annotation not found');
    return this.prisma.slideAnnotation.update({
      where: { id: annotationId },
      data: { ...(dto.label !== undefined && { label: dto.label }), ...(dto.color !== undefined && { color: dto.color }) },
      select: { id: true, x: true, y: true, label: true, color: true, createdAt: true },
    });
  }

  async removeAnnotation(annotationId: string) {
    const a = await this.prisma.slideAnnotation.findFirst({ where: { id: annotationId }, select: { id: true } });
    if (!a) throw new NotFoundException('Annotation not found');
    await this.prisma.slideAnnotation.delete({ where: { id: annotationId } });
    return { id: annotationId, deleted: true };
  }
}
