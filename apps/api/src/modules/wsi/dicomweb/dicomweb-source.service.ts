import { Injectable } from '@nestjs/common';
import { Prisma, type DicomWebAuthType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { EncryptionService } from '../../../common/encryption.service';

/** Safe projection of a DICOMweb source — NEVER the credential cipher. */
export interface DicomWebSourceView {
  id: string;
  endpointBaseUrl: string | null;
  authType: DicomWebAuthType | null;
  enabled: boolean;
  hasCredential: boolean;
  createdAt: Date;
}

/**
 * Program 5C · C3 — DICOMweb source (endpoint) administration. Tenant-scoped by the Prisma extension; the
 * credential is encrypted at rest via the existing AES-256-GCM EncryptionService and is NEVER returned by any
 * read (only `hasCredential`). `labId` is authoritative — never taken from the request body.
 */
@Injectable()
export class DicomWebSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(input: { endpointBaseUrl: string; authType?: DicomWebAuthType; credential?: string }): Promise<DicomWebSourceView> {
    const created = await this.prisma.ingestionSource.create({
      data: tenantCreate<Prisma.IngestionSourceUncheckedCreateInput>({
        kind: 'DICOMWEB',
        rootPath: null,
        endpointBaseUrl: input.endpointBaseUrl,
        authType: input.authType ?? null,
        credentialCipher: input.credential ? this.encryption.encrypt(input.credential) : null,
        enabled: true,
      }),
    });
    return this.view(created);
  }

  async list(): Promise<DicomWebSourceView[]> {
    const rows = await this.prisma.ingestionSource.findMany({ where: { kind: 'DICOMWEB' }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.view(r));
  }

  async setEnabled(id: string, enabled: boolean): Promise<DicomWebSourceView> {
    // CAS-scoped update (tenancy extension injects labId); cross-lab id simply matches 0 rows.
    const res = await this.prisma.ingestionSource.updateMany({ where: { id, kind: 'DICOMWEB' }, data: { enabled } });
    if (res.count !== 1) throw new Error('DICOMweb source not found');
    const row = await this.prisma.ingestionSource.findFirstOrThrow({ where: { id } });
    return this.view(row);
  }

  private view(r: { id: string; endpointBaseUrl: string | null; authType: DicomWebAuthType | null; enabled: boolean; credentialCipher: string | null; createdAt: Date }): DicomWebSourceView {
    return { id: r.id, endpointBaseUrl: r.endpointBaseUrl, authType: r.authType, enabled: r.enabled, hasCredential: !!r.credentialCipher, createdAt: r.createdAt };
  }
}
