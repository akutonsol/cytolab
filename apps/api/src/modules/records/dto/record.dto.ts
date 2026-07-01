import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecordStatus, RequisitionFormType, SpecimenType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class GynClinicalFeaturesDto {
  @IsBoolean() @IsOptional() routineCheck?: boolean;
  @IsBoolean() @IsOptional() previousCytology?: boolean;
  @IsDate() @IsOptional() @Type(() => Date) lmp?: Date;
  @IsString() @IsOptional() clinicalAppearanceOfCervix?: string;
  @IsBoolean() @IsOptional() nowPregnant?: boolean;
  @IsInt() @Min(0) @IsOptional() @Type(() => Number) pregnancies?: number;
  @IsString() @IsOptional() leucorrhea?: string;
  @IsBoolean() @IsOptional() menopause?: boolean;
  @IsDate() @IsOptional() @Type(() => Date) dateOfMenopause?: Date;
  @IsString() @IsOptional() lengthOfCycle?: string;
  @IsString() @IsOptional() pelvicAbnormalities?: string;
}

export class NonGynClinicalFeaturesDto {
  @IsString() @IsOptional() sampleDescription?: string;
  @IsString() @IsOptional() natureAndSource?: string;
}

export class CreateSpecimenDto {
  @IsEnum(SpecimenType) type!: SpecimenType;
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() vialColour?: string;
  @IsString() @IsOptional() antiserumA?: string;
  @IsString() @IsOptional() antiserumB?: string;
  @IsString() @IsOptional() rhSolution?: string;
  @IsString() @IsOptional() bloodGroup?: string;
}

export class CreateTherapyDto {
  @IsBoolean() @IsOptional() hormone?: boolean;
  @IsBoolean() @IsOptional() radiation?: boolean;
  @IsBoolean() @IsOptional() surgical?: boolean;
  @IsString() @IsOptional() other?: string;
}

export class CreateRecordDto {
  // NOTE: labNumber is intentionally absent — it is server-generated
  // (CBL{YY}-{MM}-{seq}), never client-set.
  @IsString() @IsNotEmpty() patientId!: string;
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  // Discriminator: which clinical form this case uses.
  @IsEnum(RequisitionFormType) @IsOptional() formType?: RequisitionFormType;
  @IsString() @IsOptional() doctor?: string;
  @IsString() @IsOptional() clinicalDiagnosis?: string;
  @IsDate() @IsOptional() @Type(() => Date) specimenDate?: Date;
  @IsBoolean() @IsOptional() urgent?: boolean;
  @IsString() @IsOptional() medicalEntry?: string;
  @IsString() @IsOptional() requisitionLineId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSpecimenDto)
  specimens?: CreateSpecimenDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTherapyDto)
  therapy?: CreateTherapyDto;

  // At most one applies — enforced server-side against formType.
  @IsOptional() @ValidateNested() @Type(() => GynClinicalFeaturesDto)
  gynFeatures?: GynClinicalFeaturesDto;
  @IsOptional() @ValidateNested() @Type(() => NonGynClinicalFeaturesDto)
  nonGynFeatures?: NonGynClinicalFeaturesDto;
}

export class UpdateRecordDto {
  @IsString() @IsOptional() clientId?: string;
  @IsEnum(RequisitionFormType) @IsOptional() formType?: RequisitionFormType;
  @IsString() @IsOptional() doctor?: string;
  @IsString() @IsOptional() clinicalDiagnosis?: string;
  @IsDate() @IsOptional() @Type(() => Date) specimenDate?: Date;
  @IsBoolean() @IsOptional() urgent?: boolean;
  @IsString() @IsOptional() medicalEntry?: string;
  @IsString() @IsOptional() workspaceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTherapyDto)
  therapy?: CreateTherapyDto;

  @IsOptional() @ValidateNested() @Type(() => GynClinicalFeaturesDto)
  gynFeatures?: GynClinicalFeaturesDto;
  @IsOptional() @ValidateNested() @Type(() => NonGynClinicalFeaturesDto)
  nonGynFeatures?: NonGynClinicalFeaturesDto;
}

export class SubmitRecordDto {
  @IsBoolean() @IsOptional() urgent?: boolean;
}

export class UpdateRecordStatusDto {
  @IsEnum(RecordStatus) status!: RecordStatus;
  @IsString() @IsOptional() notes?: string;
}

export class RecordQueryDto extends PaginationDto {
  @IsString() @IsOptional() patientId?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() requisitionId?: string;
  @IsEnum(RecordStatus) @IsOptional() status?: RecordStatus;
}
