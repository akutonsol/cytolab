import { FormCondition, TrackingStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackingQueryDto {
  @IsOptional() @IsEnum(TrackingStage) stage?: TrackingStage;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

export class ReceiveFormDto {
  @IsOptional() @IsEnum(FormCondition) formCondition?: FormCondition;
  @IsOptional() @IsString() @MaxLength(1000) formConditionNotes?: string;
  @IsOptional() @IsString() @MaxLength(200) barcodeValue?: string;
}

export class NotesDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class VerifyDto {
  @IsOptional() @IsString() @MaxLength(1000) verificationNotes?: string;
}

export class FileDto {
  @IsString() @MaxLength(200) fileLocation!: string;
}

export class RejectDto {
  @IsString() @MaxLength(1000) notes!: string;
}

export class ScanDto {
  @IsString() @MaxLength(200) barcodeValue!: string;
}
