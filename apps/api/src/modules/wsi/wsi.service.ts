import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateAnnotationDto, CreateSlideDto, UpdateAnnotationDto } from './dto/wsi.dto';

const slideSelect = {
  id: true, slideUrl: true, format: true, magnification: true, stain: true, scanner: true,
  fileSizeBytes: true, uploadedById: true, uploadedAt: true, recordId: true,
  record: {
    select: {
      id: true, labNumber: true, identifier: true, formType: true,
      patient: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
    },
  },
  annotations: { select: { id: true, x: true, y: true, label: true, color: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DigitalSlideSelect;

type Row = Prisma.DigitalSlideGetPayload<{ select: typeof slideSelect }>;

@Injectable()
export class WsiService {
  constructor(private prisma: PrismaService) {}

  private toRow(s: Row) {
    return {
      ...s,
      patientName: s.record?.patient ? `${s.record.patient.firstName} ${s.record.patient.lastName}`.trim() : '—',
      labNo: s.record ? (s.record.labNumber ?? s.record.identifier) : '—',
      annotationCount: s.annotations.length,
    };
  }

  // ── Slides ───────────────────────────────────────────────────────────────
  async createSlide(recordId: string, dto: CreateSlideDto, userId: string) {
    const record = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!record) throw new NotFoundException('Record not found');
    const slide = await this.prisma.digitalSlide.create({
      data: tenantCreate<Prisma.DigitalSlideUncheckedCreateInput>({
        recordId,
        slideUrl: dto.slideUrl,
        format: dto.format || 'image',
        magnification: dto.magnification ?? null,
        stain: dto.stain ?? null,
        scanner: dto.scanner ?? null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        uploadedById: userId,
      }),
      select: slideSelect,
    });
    return this.toRow(slide);
  }

  /** Latest slide for a record, or null. */
  async getByRecord(recordId: string) {
    const slide = await this.prisma.digitalSlide.findFirst({ where: { recordId }, orderBy: { uploadedAt: 'desc' }, select: slideSelect });
    return slide ? this.toRow(slide) : null;
  }

  async list() {
    const rows = await this.prisma.digitalSlide.findMany({ orderBy: { uploadedAt: 'desc' }, select: slideSelect, take: 500 });
    return rows.map((s) => this.toRow(s));
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
