import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { Prisma } from '@prisma/client';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class FilesService {
  private readonly gcsBucket = process.env.STORAGE_BUCKET;
  private readonly useGcs = !!process.env.STORAGE_BUCKET;

  constructor(private prisma: PrismaService) {}

  // ── Upload a file ─────────────────────────────────────────────
  async upload(file: Express.Multer.File, recordId?: string) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed`);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    let storageUrl: string;

    if (this.useGcs) {
      // GCS upload — activated when STORAGE_BUCKET is set
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      const bucket = storage.bucket(this.gcsBucket!);
      const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const blob = bucket.file(filename);
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        resumable: false,
      });
      storageUrl = `https://storage.googleapis.com/${this.gcsBucket}/${filename}`;
    } else {
      // Base64 fallback — works without GCS
      storageUrl = `data:${file.mimetype};base64,` + file.buffer.toString('base64');
    }

    if (recordId) {
      return this.prisma.recordAttachment.create({
        data: tenantCreate<Prisma.RecordAttachmentUncheckedCreateInput>({
          recordId,
          storageUrl,
          filename: file.originalname,
          kind: file.mimetype,
        }),
      });
    }

    return { storageUrl, filename: file.originalname, size: file.size, mimetype: file.mimetype };
  }

  // ── Get attachments for a record ──────────────────────────────
  async getRecordAttachments(recordId: string) {
    return this.prisma.recordAttachment.findMany({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Delete attachment ─────────────────────────────────────────
  async deleteAttachment(id: string) {
    const att = await this.prisma.recordAttachment.findFirst({ where: { id } });
    if (!att) throw new NotFoundException('Attachment not found');

    // Delete from GCS if applicable
    if (this.useGcs && att.storageUrl.startsWith('https://storage')) {
      const filename = att.storageUrl.split('/').pop()!;
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      await storage.bucket(this.gcsBucket!).file(filename).delete().catch(() => {});
    }

    await this.prisma.recordAttachment.delete({ where: { id } });
    return { deleted: true };
  }

  // ── List all files (admin view) ───────────────────────────────
  async findAll(query: { page?: number; pageSize?: number; kind?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.RecordAttachmentWhereInput = {};
    if (query.kind) where.kind = { contains: query.kind };

    const [data, total] = await Promise.all([
      this.prisma.recordAttachment.findMany({
        where, skip, take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          record: {
            select: {
              id: true,
              labNumber: true,
              identifier: true,
              patient: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.recordAttachment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  // ── Storage stats ─────────────────────────────────────────────
  async getStats() {
    const [total, byKind] = await Promise.all([
      this.prisma.recordAttachment.count(),
      this.prisma.recordAttachment.groupBy({
        by: ['kind'],
        _count: { id: true },
      }),
    ]);
    return {
      totalFiles: total,
      storageMode: this.useGcs ? 'gcs' : 'base64',
      bucket: this.gcsBucket ?? null,
      byKind: byKind.map((k) => ({
        kind: k.kind ?? 'unknown',
        count: k._count.id,
      })),
    };
  }
}
