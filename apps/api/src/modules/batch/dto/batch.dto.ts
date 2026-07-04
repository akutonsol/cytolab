import { RequisitionFormType } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class BatchAuthorizeDto {
  @IsArray()
  @ArrayMaxSize(50, { message: 'A batch may contain at most 50 records' })
  @IsString({ each: true })
  recordIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  batchNote?: string;
}

export class BatchPreviewQueryDto {
  /** Comma-separated specimen types. */
  @IsOptional() @IsString() specimenType?: string;
  @IsOptional() @IsEnum(RequisitionFormType) formType?: RequisitionFormType;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}
