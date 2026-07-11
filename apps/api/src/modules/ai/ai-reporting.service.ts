import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResultSheetEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { AiService } from './ai.service';
import { assembleRedactedPayload, digestPayload, RedactionInput, RedactionPolicy } from './redaction';
import { AiDraftKind, buildPrompt } from './prompts';
import { UpdateAiSettingsDto } from './dto/ai.dto';

// Only the clinical fields the redaction assembler needs. Patient identifiers are
// fetched solely so the free-text scrubber can strip them — they never leave here.
const contextSelect = {
  id: true,
  narrative: true,
  record: {
    select: {
      formType: true,
      patient: {
        select: {
          firstName: true, lastName: true, middleName: true, registrationNo: true,
          email: true, phoneNumber: true, motherMaidenName: true, dateOfBirth: true, gender: true,
        },
      },
      gynFeatures: true,
      nonGynFeatures: true,
      specimens: { select: { type: true } },
      client: { select: { labCode: { select: { code: true, region: true } } } },
    },
  },
  resultEntries: {
    select: { specimen: { select: { type: true } }, resultLines: { select: { abbreviation: true, result: true, findings: true, abnormalFinding: true } } },
  },
} as const;

export interface AiCapabilityResult<T> {
  available: boolean;
  reason?: string;
  data?: T;
}

@Injectable()
export class AiReportingService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private resultSheets: ResultSheetsService,
    private labContext: LabContext,
  ) {}

  // ---- Lab AI settings ----
  async getSettings() {
    const labId = this.labContext.getLabId();
    const s = await this.prisma.labAiSettings.findUnique({ where: { labId } });
    return {
      enabled: s?.enabled ?? false,
      houseStyle: s?.houseStyle ?? null,
      redactionPolicy: (s?.redactionPolicy ?? 'Strict') as RedactionPolicy,
      model: s?.model ?? null,
      // The UI shows AI actions only when the lab enabled it AND a key is configured.
      hasApiKey: this.ai.hasApiKey(),
    };
  }

  async updateSettings(dto: UpdateAiSettingsDto) {
    const labId = this.labContext.getLabId();
    await this.prisma.labAiSettings.upsert({
      where: { labId },
      update: { ...dto },
      create: tenantCreate<Prisma.LabAiSettingsUncheckedCreateInput>({ ...dto }),
    });
    return this.getSettings();
  }

  // ---- Read: recorded draft METADATA for a record (Sign-Out aggregate composition) ----
  // Metadata ONLY — never the model `output` or the accepted `finalText` (the drafted
  // content). Drafts hang off the result sheet, so this reads through resultSheet.recordId.
  // The AI reporting system remains the sole owner of generation, prompting, persistence,
  // and acceptance; this is a read so that query is never duplicated elsewhere. Tenancy is
  // enforced by the injected Prisma client (AiDraft carries labId).
  async draftsByRecord(recordId: string) {
    return this.prisma.aiDraft.findMany({
      where: { resultSheet: { recordId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        resultSheetId: true,
        kind: true,
        status: true,
        model: true,
        promptVersion: true,
        createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        acceptedAt: true,
        acceptedBy: { select: { firstName: true, lastName: true } },
        editedDiff: true, // read for presence only; the projection exposes a boolean
      },
    });
  }

  // ---- Capabilities (all on-demand; never auto-fired) ----
  async generateNarrative(sheetId: string, userId: string): Promise<AiCapabilityResult<any>> {
    return this.run('Narrative', sheetId, userId, false, async (output, ctx, promptVersion, policy, digest, model) => {
      const draft = await this.prisma.aiDraft.create({
        data: tenantCreate<Prisma.AiDraftUncheckedCreateInput>({
          resultSheetId: sheetId, kind: 'Narrative', status: 'Generated',
          output, model: model!, promptVersion, redactionPolicy: policy, inputDigest: digest, createdById: userId,
        }),
      });
      await this.event(sheetId, ResultSheetEventType.AiDrafted, userId);
      return draft;
    });
  }

  async suggestCodes(sheetId: string, userId: string): Promise<AiCapabilityResult<any>> {
    return this.run('CodeSuggestion', sheetId, userId, false, async (output, _c, promptVersion, policy, digest, model) => {
      await this.prisma.aiDraft.create({
        data: tenantCreate<Prisma.AiDraftUncheckedCreateInput>({
          resultSheetId: sheetId, kind: 'CodeSuggestion', status: 'Generated',
          output, model: model!, promptVersion, redactionPolicy: policy, inputDigest: digest, createdById: userId,
        }),
      });
      return { suggestions: this.parseJson(output, []) };
    });
  }

  async checkConsistency(sheetId: string, userId: string): Promise<AiCapabilityResult<any>> {
    // ConsistencyCheck includes the human narrative in the (still redacted) payload.
    return this.run('ConsistencyCheck', sheetId, userId, true, async (output, _c, promptVersion, policy, digest, model) => {
      await this.prisma.aiDraft.create({
        data: tenantCreate<Prisma.AiDraftUncheckedCreateInput>({
          resultSheetId: sheetId, kind: 'ConsistencyCheck', status: 'Generated',
          output, model: model!, promptVersion, redactionPolicy: policy, inputDigest: digest, createdById: userId,
        }),
      });
      return { flags: this.parseJson<any>(output, { flags: [] })?.flags ?? [] };
    });
  }

  /**
   * Accept a narrative draft: record the human's edited finalText + the edit diff
   * + acceptedBy, write it to the sheet narrative (which re-opens the sheet via the
   * de-authorize gate if it was authorized), and log the AiAccepted event.
   */
  async acceptNarrative(sheetId: string, draftId: string, userId: string, finalText: string) {
    const draft = await this.prisma.aiDraft.findFirst({ where: { id: draftId, resultSheetId: sheetId, kind: 'Narrative' } });
    if (!draft) throw new NotFoundException('AI draft not found');

    const editedDiff = { identical: draft.output === finalText, aiLength: draft.output.length, finalLength: finalText.length };
    const updatedDraft = await this.prisma.aiDraft.update({
      where: { id: draftId },
      data: { status: 'Accepted', finalText, editedDiff, acceptedAt: new Date(), acceptedById: userId },
    });
    // finalText (not the raw AI output) becomes the sheet narrative → report content.
    const sheet = await this.resultSheets.update(sheetId, userId, { narrative: finalText });
    await this.event(sheetId, ResultSheetEventType.AiAccepted, userId);
    return { draft: updatedDraft, sheet };
  }

  async rejectNarrative(sheetId: string, draftId: string) {
    const draft = await this.prisma.aiDraft.findFirst({ where: { id: draftId, resultSheetId: sheetId } });
    if (!draft) throw new NotFoundException('AI draft not found');
    return this.prisma.aiDraft.update({ where: { id: draftId }, data: { status: 'Rejected' } });
  }

  // ---- internals ----
  private async run(
    kind: AiDraftKind,
    sheetId: string,
    userId: string,
    includeNarrative: boolean,
    persist: (output: string, ctx: any, promptVersion: string, policy: RedactionPolicy, digest: string, model?: string) => Promise<any>,
  ): Promise<AiCapabilityResult<any>> {
    const settings = await this.getSettings();
    if (!settings.enabled) return { available: false, reason: 'AI assist is disabled for this lab' };
    if (!settings.hasApiKey) return { available: false, reason: 'AI is not configured' };

    const ctx = await this.prisma.resultSheet.findFirst({ where: { id: sheetId }, select: contextSelect });
    if (!ctx) throw new NotFoundException('Result sheet not found');

    const codeDescriptions = await this.codeCatalog();
    const payload = assembleRedactedPayload(this.buildInput(ctx, settings.redactionPolicy, includeNarrative, codeDescriptions));
    const { system, user, promptVersion } = buildPrompt(kind, payload, settings.houseStyle);

    const res = await this.ai.generate({ system, user, model: settings.model ?? undefined });
    if (!res.available || !res.output) return { available: false, reason: res.reason };

    const digest = digestPayload(payload);
    const data = await persist(res.output, ctx, promptVersion, settings.redactionPolicy, digest, res.model);
    return { available: true, data };
  }

  private buildInput(ctx: any, policy: RedactionPolicy, includeNarrative: boolean, codeDescriptions: Record<string, string>): RedactionInput {
    const rec = ctx.record;
    const labCode = rec.client?.labCode;
    return {
      policy,
      caseRef: 'CASE-1', // opaque per-request token; NEVER the labNumber
      formType: rec.formType,
      specimenTypes: (rec.specimens ?? []).map((s: any) => s.type),
      patient: rec.patient,
      gynFeatures: rec.gynFeatures,
      nonGynFeatures: rec.nonGynFeatures,
      resultEntries: (ctx.resultEntries ?? []).map((e: any) => ({
        specimenType: e.specimen?.type ?? null,
        resultLines: e.resultLines ?? [],
      })),
      codeDescriptions,
      labCodes: labCode ? [labCode] : [],
      narrative: includeNarrative ? ctx.narrative : undefined,
    };
  }

  private async codeCatalog(): Promise<Record<string, string>> {
    const [sheets, findings] = await Promise.all([
      this.prisma.codeSheet.findMany({ select: { abbreviation: true, description: true } }),
      this.prisma.codeFinding.findMany({ select: { abbreviation: true, description: true } }),
    ]);
    const map: Record<string, string> = {};
    for (const c of [...sheets, ...findings]) if (c.description) map[c.abbreviation] = c.description;
    return map;
  }

  private parseJson<T>(text: string, fallback: T): T {
    try {
      // Tolerate a fenced code block around the JSON.
      const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return fallback;
    }
  }

  private async event(resultSheetId: string, type: ResultSheetEventType, userId: string) {
    await this.prisma.resultSheetEvent.create({
      data: tenantCreate<Prisma.ResultSheetEventUncheckedCreateInput>({ resultSheetId, type, userId }),
    });
  }
}
