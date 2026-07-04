import { CorrelationResult, HistologySource } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCorrelationDto {
  @IsString() patientId!: string;
  @IsString() cytologyRecordId!: string;
  @IsString() @MaxLength(2000) cytologyDiagnosis!: string;

  @IsOptional() @IsString() histologyRecordId?: string;
  @IsOptional() @IsString() histologyDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) histologyDiagnosis?: string;
  @IsOptional() @IsEnum(HistologySource) histologySource?: HistologySource;
  @IsOptional() @IsString() @MaxLength(200) externalLabName?: string;

  @IsOptional() @IsEnum(CorrelationResult) correlationResult?: CorrelationResult;
  @IsOptional() @IsString() @MaxLength(2000) discordanceReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) clinicalOutcome?: string;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
}

export class UpdateCorrelationDto {
  @IsOptional() @IsString() histologyRecordId?: string;
  @IsOptional() @IsString() histologyDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) histologyDiagnosis?: string;
  @IsOptional() @IsEnum(HistologySource) histologySource?: HistologySource;
  @IsOptional() @IsString() @MaxLength(200) externalLabName?: string;
  @IsOptional() @IsEnum(CorrelationResult) correlationResult?: CorrelationResult;
  @IsOptional() @IsString() @MaxLength(2000) discordanceReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) clinicalOutcome?: string;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
}

export class ReviewCorrelationDto {
  @IsOptional() @IsString() @MaxLength(2000) reviewNotes?: string;
}

export class CorrelationQueryDto {
  @IsOptional() @IsEnum(CorrelationResult) result?: CorrelationResult;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() reviewRequired?: boolean;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}
