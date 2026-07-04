import {
  ASCSubtype, BethesdaRecommendation, GeneralCategory, GlandularCategory,
  HPVResult, SpecimenAdequacy, SquamousCategory,
} from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpsertBethesdaResultDto {
  @IsEnum(SpecimenAdequacy) specimenAdequacy!: SpecimenAdequacy;
  @IsString() @IsOptional() unsatisfactoryReason?: string;

  @IsEnum(GeneralCategory) @IsOptional() generalCategory?: GeneralCategory;

  @IsArray() @IsString({ each: true }) @IsOptional() organisms?: string[];
  @IsArray() @IsString({ each: true }) @IsOptional() otherNonNeoplastic?: string[];

  @IsEnum(SquamousCategory) @IsOptional() squamousCategory?: SquamousCategory;
  @IsEnum(ASCSubtype) @IsOptional() ascSubtype?: ASCSubtype;

  @IsEnum(GlandularCategory) @IsOptional() glandularCategory?: GlandularCategory;
  @IsString() @IsOptional() glandularSubtype?: string;

  @IsString() @IsOptional() otherMalignancy?: string;

  @IsEnum(HPVResult) @IsOptional() hpvResult?: HPVResult;
  @IsString() @IsOptional() hpvGenotype?: string;

  @IsEnum(BethesdaRecommendation) @IsOptional() recommendation?: BethesdaRecommendation;
  @IsString() @IsOptional() recommendationNotes?: string;
}
