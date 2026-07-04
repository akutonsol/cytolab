import { EscalationSeverity, EscalationStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class EscalationQueryDto {
  @IsOptional()
  @IsEnum(EscalationStatus)
  status?: EscalationStatus;

  @IsOptional()
  @IsEnum(EscalationSeverity)
  severity?: EscalationSeverity;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  assignedToMe?: boolean;

  /** When true, restrict to open escalations (Pending/Acknowledged/UnderReview). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  open?: boolean;

  @IsOptional()
  @IsString()
  recordId?: string;
}

export class ManualEscalateDto {
  @IsString()
  recordId!: string;

  @IsEnum(EscalationSeverity)
  severity!: EscalationSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReviewNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
