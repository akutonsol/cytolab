import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ASCSubtype, GeneralCategory, GlandularCategory, HPVResult, Prisma, SpecimenAdequacy, SquamousCategory,
  BethesdaRecommendation,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { UpsertBethesdaResultDto } from './dto/bethesda.dto';

// Selection subset used by the pure narrative/shortCode helpers.
export interface BethesdaSelections {
  specimenAdequacy: SpecimenAdequacy;
  unsatisfactoryReason?: string | null;
  generalCategory?: GeneralCategory | null;
  organisms?: string[];
  otherNonNeoplastic?: string[];
  squamousCategory?: SquamousCategory | null;
  ascSubtype?: ASCSubtype | null;
  glandularCategory?: GlandularCategory | null;
  glandularSubtype?: string | null;
  otherMalignancy?: string | null;
  hpvResult?: HPVResult | null;
  hpvGenotype?: string | null;
  recommendation?: BethesdaRecommendation | null;
  recommendationNotes?: string | null;
}

const GENERAL: Record<GeneralCategory, string> = {
  NILM: 'Negative for Intraepithelial Lesion or Malignancy',
  EpithelialAbnormality: 'Epithelial Cell Abnormality',
  OtherMalignancy: 'Other Malignancy',
};
const REC_TEXT: Record<BethesdaRecommendation, string> = {
  RoutineScreening: 'Routine screening as per clinical guidelines.',
  RepeatIn1Year: 'Repeat cytology in 1 year.',
  HPVReflexTesting: 'HPV reflex testing recommended.',
  Colposcopy: 'Colposcopy recommended. Clinical correlation advised.',
  UrgentColposcopy: 'Urgent colposcopy and biopsy recommended.',
  EndocervicalSampling: 'Colposcopy with endocervical sampling.',
  RepeatSpecimen: 'Repeat specimen collection recommended.',
  ClinicalCorrelation: 'Clinical correlation advised.',
};

function squamousText(d: BethesdaSelections): string {
  switch (d.squamousCategory) {
    case 'ASC':
      return d.ascSubtype === 'ASCH'
        ? 'Atypical squamous cells, cannot exclude high-grade squamous intraepithelial lesion (ASC-H).'
        : 'Atypical squamous cells of undetermined significance (ASC-US).';
    case 'LSIL': return 'Low-grade squamous intraepithelial lesion (LSIL).';
    case 'HSIL': return 'High-grade squamous intraepithelial lesion (HSIL).';
    case 'SCC': return 'Squamous cell carcinoma.';
    default: return '';
  }
}
function glandularText(d: BethesdaSelections): string {
  switch (d.glandularCategory) {
    case 'AGC': return 'Atypical glandular cells (AGC).';
    case 'AGC_FavorNeoplastic': return 'Atypical glandular cells, favor neoplastic.';
    case 'AIS': return 'Endocervical adenocarcinoma in situ (AIS).';
    case 'Adenocarcinoma': return 'Adenocarcinoma.';
    case 'Other': return d.glandularSubtype?.trim() || 'Atypical glandular cells, other.';
    default: return '';
  }
}

/** Compose a TBS-2014 narrative from the structured selections. */
export function generateNarrative(d: BethesdaSelections): string {
  const blocks: string[] = [];
  blocks.push(
    `SPECIMEN ADEQUACY: ${d.specimenAdequacy === 'Satisfactory'
      ? 'Satisfactory for evaluation'
      : `Unsatisfactory for evaluation${d.unsatisfactoryReason ? ` — ${d.unsatisfactoryReason}` : ''}`}`,
  );

  if (d.specimenAdequacy === 'Unsatisfactory') {
    blocks.push(`RECOMMENDATION: ${d.recommendation ? REC_TEXT[d.recommendation] : REC_TEXT.RepeatSpecimen}${d.recommendationNotes ? ` ${d.recommendationNotes}` : ''}`);
    return blocks.join('\n\n');
  }

  if (d.generalCategory) blocks.push(`GENERAL CATEGORIZATION: ${GENERAL[d.generalCategory]}`);

  const interp: string[] = [];
  if (d.generalCategory === 'NILM') {
    interp.push('Negative for intraepithelial lesion or malignancy.');
    if (d.organisms?.length) interp.push(`Organisms identified: ${d.organisms.join(', ')}.`);
    if (d.otherNonNeoplastic?.length) interp.push(`Other non-neoplastic findings: ${d.otherNonNeoplastic.join(', ')}.`);
  } else if (d.generalCategory === 'EpithelialAbnormality') {
    const s = squamousText(d); if (s) interp.push(s);
    const g = glandularText(d); if (g) interp.push(g);
  } else if (d.generalCategory === 'OtherMalignancy' && d.otherMalignancy) {
    interp.push(d.otherMalignancy.trim());
  }
  if (interp.length) blocks.push(`INTERPRETATION / RESULT:\n${interp.join('\n')}`);

  if (d.hpvResult) {
    blocks.push(`HPV TESTING: ${d.hpvResult === 'NotPerformed' ? 'Not performed' : d.hpvResult}${d.hpvGenotype ? ` (genotype ${d.hpvGenotype})` : ''}.`);
  }
  if (d.recommendation) {
    blocks.push(`RECOMMENDATION: ${REC_TEXT[d.recommendation]}${d.recommendationNotes ? ` ${d.recommendationNotes}` : ''}`);
  }
  return blocks.join('\n\n');
}

/** Map the classification to a Result-Template shortCode (NILM/LSIL/HSIL/…). */
export function deriveShortCode(d: BethesdaSelections): string | null {
  if (d.specimenAdequacy === 'Unsatisfactory') return 'UNSAT';
  if (d.generalCategory === 'NILM') return 'NILM';
  if (d.squamousCategory) {
    if (d.squamousCategory === 'ASC') return d.ascSubtype === 'ASCH' ? 'ASC-H' : 'ASCUS';
    return d.squamousCategory; // LSIL / HSIL / SCC
  }
  if (d.glandularCategory) return 'AGUS';
  if (d.generalCategory === 'OtherMalignancy') return 'MALIG';
  return null;
}

@Injectable()
export class BethesdaService {
  constructor(private prisma: PrismaService) {}

  async getByRecord(recordId: string) {
    const result = await this.prisma.bethesdaResult.findFirst({
      where: { recordId },
      include: { reportedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!result) return null;
    return { ...result, shortCode: deriveShortCode(result as BethesdaSelections) };
  }

  async upsert(recordId: string, dto: UpsertBethesdaResultDto, userId: string) {
    const record = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!record) throw new NotFoundException('Record not found');
    if (dto.specimenAdequacy === 'Satisfactory' && !dto.generalCategory) {
      throw new BadRequestException('General categorization is required for a satisfactory specimen');
    }

    const generatedNarrative = generateNarrative(dto);
    const data = {
      unsatisfactoryReason: dto.unsatisfactoryReason?.trim() || null,
      generalCategory: dto.generalCategory ?? null,
      organisms: dto.organisms ?? [],
      otherNonNeoplastic: dto.otherNonNeoplastic ?? [],
      squamousCategory: dto.squamousCategory ?? null,
      ascSubtype: dto.ascSubtype ?? null,
      glandularCategory: dto.glandularCategory ?? null,
      glandularSubtype: dto.glandularSubtype?.trim() || null,
      otherMalignancy: dto.otherMalignancy?.trim() || null,
      hpvResult: dto.hpvResult ?? null,
      hpvGenotype: dto.hpvGenotype?.trim() || null,
      recommendation: dto.recommendation ?? null,
      recommendationNotes: dto.recommendationNotes?.trim() || null,
      generatedNarrative,
    };

    const result = await this.prisma.bethesdaResult.upsert({
      where: { recordId },
      create: tenantCreate<Prisma.BethesdaResultUncheckedCreateInput>({
        recordId,
        specimenAdequacy: dto.specimenAdequacy,
        reportedById: userId,
        ...data,
      }),
      update: { specimenAdequacy: dto.specimenAdequacy, reportedById: userId, reportedAt: new Date(), ...data },
      include: { reportedBy: { select: { firstName: true, lastName: true } } },
    });
    return { ...result, shortCode: deriveShortCode(result as BethesdaSelections) };
  }

  async remove(recordId: string) {
    const existing = await this.prisma.bethesdaResult.findFirst({ where: { recordId }, select: { id: true } });
    if (!existing) throw new NotFoundException('No Bethesda result for this record');
    await this.prisma.bethesdaResult.delete({ where: { id: existing.id } });
    return { deleted: true };
  }
}
