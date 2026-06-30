import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecordStatus, SpecimenType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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
  @IsString() @IsNotEmpty() patientId!: string;
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  @IsString() @IsOptional() clinicalDiagnosis?: string;
  @IsString() @IsOptional() labNumber?: string;
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
}

export class UpdateRecordDto {
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() clinicalDiagnosis?: string;
  @IsString() @IsOptional() labNumber?: string;
  @IsBoolean() @IsOptional() urgent?: boolean;
  @IsString() @IsOptional() medicalEntry?: string;
  @IsString() @IsOptional() workspaceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTherapyDto)
  therapy?: CreateTherapyDto;
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
