import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequisitionFormType, RequisitionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateRequisitionLineDto {
  @IsEnum(RequisitionFormType) @IsOptional() formType?: RequisitionFormType;
  @IsBoolean() @IsOptional() isUrgent?: boolean;
  @IsString() @IsOptional() notes?: string;
  // Line cost in minor units (cents).
  @IsInt() @Min(0) @IsOptional() @Type(() => Number) amount?: number;
}

export class CreateRequisitionDto {
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateReceived?: Date;
  // Requisition total is derived from the line costs; not accepted from input.

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionLineDto)
  lines?: CreateRequisitionLineDto[];
}

export class UpdateRequisitionLineDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsEnum(RequisitionFormType) @IsOptional() formType?: RequisitionFormType;
  @IsBoolean() @IsOptional() isUrgent?: boolean;
  @IsBoolean() @IsOptional() isCompleted?: boolean;
  @IsString() @IsOptional() notes?: string;
  @IsInt() @Min(0) @IsOptional() @Type(() => Number) amount?: number;
  @IsString() @IsOptional() recordId?: string;
}

export class RequisitionQueryDto extends PaginationDto {
  @IsEnum(RequisitionStatus) @IsOptional() status?: RequisitionStatus;
}

export class RequisitionReportDto {
  @IsString() @IsOptional() dateFrom?: string;
  @IsString() @IsOptional() dateTo?: string;
  @IsIn(['client', 'status', 'date']) @IsOptional() groupBy?: 'client' | 'status' | 'date';
  @IsString() @IsOptional() clientId?: string;
  @IsEnum(RequisitionStatus) @IsOptional() status?: RequisitionStatus;
}
