import { ConsultAgreement, ConsultStatus, ConsultUrgency } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListConsultQueryDto {
  @IsOptional() @IsEnum(ConsultStatus) status?: ConsultStatus;
  @IsOptional() @IsEnum(ConsultUrgency) urgency?: ConsultUrgency;
}

export class CreateConsultDto {
  @IsString() recordId!: string;
  @IsString() @MaxLength(200) consultantName!: string;
  @IsEmail() consultantEmail!: string;
  @IsOptional() @IsString() @MaxLength(200) consultantInstitution?: string;
  @IsString() @MaxLength(5000) clinicalSummary!: string;
  @IsString() @MaxLength(2000) specificQuestion!: string;
  @IsEnum(ConsultUrgency) urgency!: ConsultUrgency;
  @IsOptional() @IsString() dueDate?: string;
  @IsBoolean() sharedNarrative!: boolean;
  @IsBoolean() sharedBethesda!: boolean;
  @IsBoolean() sharedImages!: boolean;
}

export class UpdateConsultDto {
  @IsOptional() @IsEnum(ConsultUrgency) urgency?: ConsultUrgency;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RespondConsultDto {
  @IsString() accessToken!: string;
  @IsString() @MaxLength(5000) consultantResponse!: string;
  @IsOptional() @IsString() @MaxLength(500) consultantDiagnosis?: string;
  @IsOptional() @IsEnum(ConsultAgreement) agreementLevel?: ConsultAgreement;
}
