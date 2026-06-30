import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequisitionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateRequisitionLineDto {
  @IsBoolean() @IsOptional() isUrgent?: boolean;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsOptional() amount?: number;
}

export class CreateRequisitionDto {
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateReceived?: Date;
  @IsNumber() @IsOptional() amount?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionLineDto)
  lines?: CreateRequisitionLineDto[];
}

export class UpdateRequisitionLineDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsBoolean() @IsOptional() isUrgent?: boolean;
  @IsBoolean() @IsOptional() isCompleted?: boolean;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsOptional() amount?: number;
  @IsString() @IsOptional() recordId?: string;
}

export class RequisitionQueryDto extends PaginationDto {
  @IsEnum(RequisitionStatus) @IsOptional() status?: RequisitionStatus;
}
