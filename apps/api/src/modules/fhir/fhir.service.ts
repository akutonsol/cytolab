import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { FhirBuilderService, type FhirRecordData } from './fhir-builder.service';
import { CreateEndpointDto, TransmissionQueryDto, UpdateEndpointDto } from './dto/fhir.dto';

// Never leak secrets to the client.
const endpointSelect = {
  id: true, name: true, baseUrl: true, system: true, authType: true, isActive: true, isSandbox: true,
  clientId: true, lastTestedAt: true, lastTestStatus: true, createdAt: true, updatedAt: true,
  _count: { select: { transmissions: true } },
} satisfies Prisma.FHIREndpointSelect;

const txSelect = {
  id: true, status: true, fhirResourceId: true, responseCode: true, responseBody: true, errorMessage: true,
  retryCount: true, transmittedAt: true, createdAt: true, endpointId: true, recordId: true,
  endpoint: { select: { name: true, system: true, isSandbox: true } },
  record: { select: { labNumber: true, identifier: true, patient: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.FHIRTransmissionSelect;

const TEST_TIMEOUT_MS = 8000;

@Injectable()
export class FhirService {
  private readonly log = new Logger(FhirService.name);
  constructor(private prisma: PrismaService, private builder: FhirBuilderService) {}

  // ── Endpoints ──────────────────────────────────────────────────────────────
  listEndpoints() {
    return this.prisma.fHIREndpoint.findMany({ select: endpointSelect, orderBy: { createdAt: 'desc' } });
  }

  async createEndpoint(dto: CreateEndpointDto) {
    const dup = await this.prisma.fHIREndpoint.findFirst({ where: { name: dto.name }, select: { id: true } });
    if (dup) throw new ConflictException('An endpoint with that name already exists.');
    return this.prisma.fHIREndpoint.create({
      data: tenantCreate<Prisma.FHIREndpointUncheckedCreateInput>({
        name: dto.name, baseUrl: dto.baseUrl, system: dto.system, authType: dto.authType,
        authToken: dto.authToken ?? null, clientId: dto.clientId ?? null, clientSecret: dto.clientSecret ?? null,
        isSandbox: dto.isSandbox ?? true,
      }),
      select: endpointSelect,
    });
  }

  async updateEndpoint(id: string, dto: UpdateEndpointDto) {
    await this.getEndpoint(id);
    return this.prisma.fHIREndpoint.update({ where: { id }, data: { ...dto }, select: endpointSelect });
  }

  async deactivateEndpoint(id: string) {
    await this.getEndpoint(id);
    return this.prisma.fHIREndpoint.update({ where: { id }, data: { isActive: false }, select: endpointSelect });
  }

  private async getEndpoint(id: string) {
    const e = await this.prisma.fHIREndpoint.findFirst({ where: { id } });
    if (!e) throw new NotFoundException('Endpoint not found');
    return e;
  }

  private authHeaders(e: { authType: string; authToken: string | null }): Record<string, string> {
    if (e.authType === 'Bearer' && e.authToken) return { Authorization: `Bearer ${e.authToken}` };
    if (e.authType === 'APIKey' && e.authToken) return { 'x-api-key': e.authToken };
    return {};
  }

  /** GET {baseUrl}/metadata to confirm the endpoint speaks FHIR. */
  async testEndpoint(id: string) {
    const e = await this.getEndpoint(id);
    const url = `${e.baseUrl.replace(/\/$/, '')}/metadata`;
    let status: string;
    let ok = false;
    let capability: any = null;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/fhir+json', ...this.authHeaders(e) }, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
      ok = res.ok;
      status = `${res.status} ${res.statusText}`.trim();
      if (res.ok) { try { const body = await res.json(); capability = { fhirVersion: body?.fhirVersion ?? null, software: body?.software?.name ?? null }; } catch { /* non-JSON */ } }
    } catch (err) {
      status = `Failed: ${(err as Error).message}`;
    }
    await this.prisma.fHIREndpoint.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestStatus: status } });
    return { ok, status, capability, testedAt: new Date().toISOString() };
  }

  // ── FHIR building / preview ─────────────────────────────────────────────────
  private async loadRecordData(recordId: string): Promise<FhirRecordData> {
    const rec = await this.prisma.record.findFirst({
      where: { id: recordId },
      select: {
        id: true, specimenDate: true, formType: true,
        patient: { select: { id: true, registrationNo: true, firstName: true, lastName: true, gender: true, dateOfBirth: true } },
        resultSheets: {
          orderBy: [{ authorized: 'desc' }, { updatedAt: 'desc' }], take: 1,
          select: { narrative: true, authorized: true, authorizedAt: true, authorizedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
        codings: { select: { codeType: true, code: { select: { system: true, code: true, display: true } } } },
      },
    });
    if (!rec) throw new NotFoundException('Record not found');
    return { id: rec.id, specimenDate: rec.specimenDate, formType: rec.formType, patient: rec.patient, sheet: rec.resultSheets[0] ?? null, codings: rec.codings };
  }

  async preview(recordId: string) {
    const data = await this.loadRecordData(recordId);
    return {
      patient: data.patient ? this.builder.buildPatient(data.patient) : null,
      diagnosticReport: this.builder.buildDiagnosticReport(data),
      bundle: this.builder.buildBundle(data),
    };
  }

  // ── Transmission ─────────────────────────────────────────────────────────────
  async transmit(recordId: string, endpointId: string) {
    const endpoint = await this.getEndpoint(endpointId);
    const data = await this.loadRecordData(recordId);
    const payload = this.builder.buildBundle(data) as unknown as Prisma.InputJsonValue;

    let status: 'Success' | 'Failed' = 'Success';
    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let fhirResourceId: string | null = null;

    if (endpoint.isSandbox) {
      responseBody = 'Sandbox mode — FHIR payload generated and stored, not transmitted to a live endpoint.';
      fhirResourceId = `sandbox-${data.id}`;
    } else {
      // Live POST of the transaction bundle to the endpoint root.
      try {
        const res = await fetch(endpoint.baseUrl.replace(/\/$/, ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json', ...this.authHeaders(endpoint) },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 2000);
        if (res.ok) { try { fhirResourceId = JSON.parse(responseBody)?.id ?? null; } catch { /* ignore */ } }
        else { status = 'Failed'; errorMessage = `EMR responded ${res.status}`; }
      } catch (err) {
        status = 'Failed'; errorMessage = (err as Error).message;
      }
    }

    const tx = await this.prisma.fHIRTransmission.create({
      data: tenantCreate<Prisma.FHIRTransmissionUncheckedCreateInput>({
        endpointId, recordId, status, fhirPayload: payload, responseCode, responseBody, errorMessage, fhirResourceId,
        transmittedAt: status === 'Success' ? new Date() : null,
      }),
      select: txSelect,
    });
    return { transmissionId: tx.id, status: tx.status, payload };
  }

  /** Retry the most recent transmission for a record, reusing its endpoint. */
  async retry(recordId: string) {
    const prev = await this.prisma.fHIRTransmission.findFirst({ where: { recordId }, orderBy: { createdAt: 'desc' }, select: { id: true, endpointId: true } });
    if (!prev) throw new NotFoundException('No prior transmission to retry for this record');
    const result = await this.transmit(recordId, prev.endpointId);
    await this.prisma.fHIRTransmission.update({ where: { id: prev.id }, data: { retryCount: { increment: 1 } } });
    return result;
  }

  listTransmissions(query: TransmissionQueryDto) {
    const where: Prisma.FHIRTransmissionWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.endpointId && { endpointId: query.endpointId }),
    };
    return this.prisma.fHIRTransmission.findMany({ where, select: txSelect, orderBy: { createdAt: 'desc' }, take: 300 });
  }

  recordHistory(recordId: string) {
    return this.prisma.fHIRTransmission.findMany({ where: { recordId }, select: txSelect, orderBy: { createdAt: 'desc' } });
  }

  async stats() {
    const [all, endpoints] = await Promise.all([
      this.prisma.fHIRTransmission.findMany({ select: { status: true, endpointId: true, endpoint: { select: { name: true } } } }),
      this.prisma.fHIREndpoint.count({ where: { isActive: true } }),
    ]);
    const total = all.length;
    const successful = all.filter((t) => t.status === 'Success').length;
    const failed = all.filter((t) => t.status === 'Failed').length;
    const pending = all.filter((t) => ['Pending', 'Sending', 'Retrying'].includes(t.status)).length;
    const byEndpointMap = new Map<string, { name: string; count: number; success: number }>();
    for (const t of all) {
      const e = byEndpointMap.get(t.endpointId) ?? { name: t.endpoint?.name ?? '—', count: 0, success: 0 };
      e.count++; if (t.status === 'Success') e.success++;
      byEndpointMap.set(t.endpointId, e);
    }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = all.length ? await this.prisma.fHIRTransmission.count({ where: { createdAt: { gte: todayStart } } }) : 0;
    return {
      activeEndpoints: endpoints,
      totalTransmissions: total,
      successful,
      failed,
      pending,
      successRate: total ? Math.round((successful / total) * 1000) / 10 : 0,
      todayCount,
      byEndpoint: [...byEndpointMap.values()].map((e) => ({ name: e.name, count: e.count, successRate: e.count ? Math.round((e.success / e.count) * 1000) / 10 : 0 })),
    };
  }
}
