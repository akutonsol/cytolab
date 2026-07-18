import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeSystem, CodingType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { deriveShortCode } from '../bethesda/bethesda.service';
import { AssignCodeDto, CodeQueryDto, CreateCodeDto, ExportQueryDto, UpdateCodeDto } from './dto/coding.dto';
import { AuditRecorder } from '../audit/audit-recorder.service';

// Specimen (formType) → LOINC procedure code.
const SPECIMEN_LOINC: Record<string, string> = { Gynecology: '10524-7', NonGynecology: 'LP7786-0' };

// Bethesda short code → standard diagnosis codes.
const BETHESDA_MAP: Record<string, { system: CodeSystem; code: string; codeType: CodingType }[]> = {
  NILM: [{ system: 'SNOMED_CT', code: '373883009', codeType: 'Diagnosis' }],
  ASCUS: [{ system: 'SNOMED_CT', code: '285838002', codeType: 'Diagnosis' }, { system: 'ICD10', code: 'R87.619', codeType: 'Diagnosis' }],
  LSIL: [{ system: 'SNOMED_CT', code: '285854005', codeType: 'Diagnosis' }, { system: 'ICD10', code: 'N87.0', codeType: 'Diagnosis' }],
  HSIL: [{ system: 'SNOMED_CT', code: '285855006', codeType: 'Diagnosis' }, { system: 'ICD10', code: 'N87.1', codeType: 'Diagnosis' }],
  'ASC-H': [{ system: 'SNOMED_CT', code: '413448000', codeType: 'Diagnosis' }],
  SCC: [{ system: 'SNOMED_CT', code: '254886006', codeType: 'Diagnosis' }],
  AGUS: [{ system: 'SNOMED_CT', code: '413443001', codeType: 'Diagnosis' }],
};

const codingSelect = {
  id: true, codeType: true, notes: true, assignedAt: true,
  code: { select: { id: true, system: true, code: true, display: true, category: true } },
  assignedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.RecordCodingSelect;

const specimenLabel = (f: string | null) => (f === 'Gynecology' ? 'Gynecologic' : f === 'NonGynecology' ? 'Non-gynecologic' : 'Cytology');
const initials = (f?: string, l?: string) => `${(f?.[0] ?? '').toUpperCase()}${(l?.[0] ?? '').toUpperCase()}` || '—';

@Injectable()
export class CodingService {
  constructor(private prisma: PrismaService, private audit: AuditRecorder) {}

  // ── Dictionary ─────────────────────────────────────────────────────────────
  listCodes(query: CodeQueryDto) {
    const where: Prisma.MedicalCodeWhereInput = {
      ...(query.system && { system: query.system }),
      ...(query.category && { category: query.category }),
      ...(query.search && { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { display: { contains: query.search, mode: 'insensitive' } }] }),
    };
    return this.prisma.medicalCode.findMany({ where, orderBy: [{ system: 'asc' }, { code: 'asc' }], take: 500 });
  }

  async createCode(dto: CreateCodeDto) {
    const existing = await this.prisma.medicalCode.findFirst({ where: { system: dto.system, code: dto.code }, select: { id: true } });
    if (existing) throw new ConflictException('That code already exists in this system.');
    return this.prisma.medicalCode.create({
      data: tenantCreate<Prisma.MedicalCodeUncheckedCreateInput>({ system: dto.system, code: dto.code, display: dto.display, category: dto.category ?? null }),
    });
  }

  async updateCode(id: string, dto: UpdateCodeDto) {
    const c = await this.prisma.medicalCode.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Code not found');
    return this.prisma.medicalCode.update({ where: { id }, data: { ...(dto.display !== undefined && { display: dto.display }), ...(dto.category !== undefined && { category: dto.category || null }), ...(dto.isActive !== undefined && { isActive: dto.isActive }) } });
  }

  async deactivateCode(id: string) {
    const c = await this.prisma.medicalCode.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Code not found');
    return this.prisma.medicalCode.update({ where: { id }, data: { isActive: false } });
  }

  // ── Record codings ───────────────────────────────────────────────────────
  getRecordCodings(recordId: string) {
    return this.prisma.recordCoding.findMany({ where: { recordId }, select: codingSelect, orderBy: { assignedAt: 'asc' } });
  }

  async assignCode(recordId: string, dto: AssignCodeDto, userId: string) {
    const [record, code] = await Promise.all([
      this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } }),
      this.prisma.medicalCode.findFirst({ where: { id: dto.codeId }, select: { id: true } }),
    ]);
    if (!record) throw new NotFoundException('Record not found');
    if (!code) throw new NotFoundException('Code not found');
    const existing = await this.prisma.recordCoding.findFirst({ where: { recordId, codeId: dto.codeId }, select: { id: true } });
    if (existing) throw new ConflictException('That code is already assigned to this record.');

    const [coding] = await this.prisma.$transaction([
      this.prisma.recordCoding.create({
        data: tenantCreate<Prisma.RecordCodingUncheckedCreateInput>({ recordId, codeId: dto.codeId, codeType: dto.codeType, notes: dto.notes ?? null, assignedById: userId }),
        select: codingSelect,
      }),
      this.prisma.medicalCode.update({ where: { id: dto.codeId }, data: { usageCount: { increment: 1 } } }),
    ]);
    return coding;
  }

  async removeCoding(recordId: string, codeId: string) {
    const c = await this.prisma.recordCoding.findFirst({ where: { recordId, codeId }, select: { id: true } });
    if (!c) throw new NotFoundException('Coding not found');
    await this.prisma.$transaction([
      this.prisma.recordCoding.delete({ where: { id: c.id } }),
      this.prisma.medicalCode.update({ where: { id: codeId }, data: { usageCount: { decrement: 1 } } }),
    ]);
    return { recordId, codeId, removed: true };
  }

  // ── Auto-suggest ───────────────────────────────────────────────────────────
  async suggest(recordId: string) {
    const record = await this.prisma.record.findFirst({
      where: { id: recordId },
      select: {
        id: true, formType: true,
        bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } },
        codings: { select: { codeId: true } },
      },
    });
    if (!record) throw new NotFoundException('Record not found');
    const assigned = new Set(record.codings.map((c) => c.codeId));

    const wanted: { system: CodeSystem; code: string; codeType: CodingType; confidence: number; reason: string }[] = [];
    // Specimen → LOINC procedure.
    const loinc = SPECIMEN_LOINC[record.formType ?? ''];
    if (loinc) wanted.push({ system: 'LOINC', code: loinc, codeType: 'Procedure', confidence: 0.8, reason: `${specimenLabel(record.formType)} specimen` });
    // Bethesda → SNOMED / ICD10.
    const shortCode = record.bethesdaResult ? deriveShortCode(record.bethesdaResult as any) : null;
    for (const m of BETHESDA_MAP[shortCode ?? ''] ?? []) wanted.push({ ...m, confidence: 0.95, reason: `Bethesda ${shortCode}` });

    // Resolve to dictionary rows that exist for this lab.
    const rows = await this.prisma.medicalCode.findMany({
      where: { OR: wanted.map((w) => ({ system: w.system, code: w.code })) },
      select: { id: true, system: true, code: true, display: true, category: true },
    });
    const byKey = new Map(rows.map((r) => [`${r.system}:${r.code}`, r]));
    return wanted
      .map((w) => { const row = byKey.get(`${w.system}:${w.code}`); return row ? { code: row, codeType: w.codeType, confidence: w.confidence, reason: w.reason, alreadyAssigned: assigned.has(row.id) } : null; })
      .filter(Boolean);
  }

  // ── Records tab ────────────────────────────────────────────────────────────
  async records() {
    const recs = await this.prisma.record.findMany({
      where: { bethesdaResult: { isNot: null } },
      select: {
        id: true, labNumber: true, identifier: true, formType: true,
        patient: { select: { firstName: true, lastName: true } },
        bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } },
        codings: { select: { codeType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const rows = recs.map((r) => {
      const types = new Set(r.codings.map((c) => c.codeType));
      const status = r.codings.length === 0 ? 'Uncoded' : (types.has('Procedure') && types.has('Diagnosis')) ? 'Coded' : 'Partial';
      return {
        recordId: r.id,
        labNo: r.labNumber ?? r.identifier,
        patientInitials: r.patient ? initials(r.patient.firstName, r.patient.lastName) : '—',
        specimenType: specimenLabel(r.formType),
        bethesda: r.bethesdaResult ? deriveShortCode(r.bethesdaResult as any) : null,
        codesAssigned: r.codings.length,
        status,
      };
    });
    // Enterprise audit (P2-5DR): the coding worklist IS PHI-bearing — it links identifiable records
    // (recordId, labNo, patient initials) to the Bethesda diagnostic interpretation. Aggregate PHI
    // read on the 'coding' surface; bounded metadata only (never initials/codes/IDs). Emit if > 0.
    await this.audit.recordPhiList({
      accessSurface: 'coding',
      producerModule: 'coding',
      resultCount: rows.length,
      resourceType: 'CodingWorklist',
    });
    return rows;
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  async stats() {
    const [codedRecs, codeableRecs, codings, mostUsed] = await Promise.all([
      this.prisma.recordCoding.findMany({ distinct: ['recordId'], select: { recordId: true } }),
      this.prisma.record.count({ where: { bethesdaResult: { isNot: null } } }),
      this.prisma.recordCoding.findMany({ select: { code: { select: { system: true } } } }),
      this.prisma.medicalCode.findMany({ where: { usageCount: { gt: 0 } }, orderBy: { usageCount: 'desc' }, take: 5, select: { system: true, code: true, display: true, usageCount: true } }),
    ]);
    const totalCoded = codedRecs.length;
    const bySystem: Record<string, number> = { LOINC: 0, SNOMED_CT: 0, ICD10: 0, CPT: 0 };
    for (const c of codings) bySystem[c.code.system] = (bySystem[c.code.system] ?? 0) + 1;
    const dictionarySize = await this.prisma.medicalCode.count();
    return {
      totalCoded,
      uncoded: Math.max(0, codeableRecs - totalCoded),
      dictionarySize,
      bySystem,
      mostUsedCodes: mostUsed,
    };
  }

  // ── Export ───────────────────────────────────────────────────────────────
  async exportData(query: ExportQueryDto) {
    const from = query.dateFrom ? new Date(query.dateFrom) : new Date('2000-01-01');
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    to.setHours(23, 59, 59, 999);
    const recs = await this.prisma.record.findMany({
      where: { codings: { some: {} }, createdAt: { gte: from, lte: to } },
      select: {
        id: true, labNumber: true, identifier: true, formType: true, createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
        codings: { select: { codeType: true, code: { select: { system: true, code: true, display: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const records = recs.map((r) => ({
      labNo: r.labNumber ?? r.identifier,
      patientInitials: r.patient ? initials(r.patient.firstName, r.patient.lastName) : '—',
      specimenType: specimenLabel(r.formType),
      date: r.createdAt.toISOString().slice(0, 10),
      codes: r.codings.map((c) => ({ system: c.code.system, code: c.code.code, display: c.code.display, codeType: c.codeType })),
    }));
    // P2-5DR: exportData only RETRIEVES + SHAPES the export dataset — it is not the artifact. The
    // PHI_EXPORTED event is emitted at the artifact-generation boundary (toCsv), not here.
    return { generatedAt: new Date().toISOString(), period: { from: from.toISOString(), to: to.toISOString() }, count: records.length, records };
  }

  async toCsv(data: { records: { labNo: string; patientInitials: string; specimenType: string; date: string; codes: { system: string; code: string; display: string; codeType: string }[] }[] }) {
    const header = ['Lab No', 'Patient', 'Specimen', 'Date', 'System', 'Code', 'Display', 'Type'];
    const rows: string[] = [header.join(',')];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    for (const r of data.records) {
      if (r.codes.length === 0) rows.push([r.labNo, r.patientInitials, r.specimenType, r.date, '', '', '', ''].map(esc).join(','));
      for (const c of r.codes) rows.push([r.labNo, r.patientInitials, r.specimenType, r.date, c.system, c.code, c.display, c.codeType].map(esc).join(','));
    }
    const csv = rows.join('\n');
    // P2-5DR: this is the CSV artifact-generation success boundary — the event is emitted ONLY after
    // the CSV bytes are successfully built (a build failure above never reaches here). Bounded
    // metadata only: no filenames/URLs/rows/PHI. Known-empty export (count 0) emits nothing.
    await this.audit.recordPhiExport({
      accessSurface: 'export',
      producerModule: 'coding',
      documentType: 'coding',
      resultCount: data.records.length,
      resourceType: 'CodingExport',
    });
    return csv;
  }
}
