import { ReagentStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateReagentDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(120) lotNumber!: string;
  @IsOptional() @IsString() @MaxLength(200) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(120) catalogNumber?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() receivedDate?: string;
  @IsOptional() @IsString() openedDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsString() @MaxLength(60) storageTemp?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateReagentDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(120) catalogNumber?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() openedDate?: string;
  @IsOptional() @IsEnum(ReagentStatus) status?: ReagentStatus;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsString() @MaxLength(60) storageTemp?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ReagentQueryDto {
  @IsOptional() @IsEnum(ReagentStatus) status?: ReagentStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') expiringSoon?: boolean;
}

export class UseReagentDto {
  @IsOptional() @IsString() recordId?: string;
  @IsOptional() @IsString() @MaxLength(120) batchId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantityUsed?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class QuarantineDto {
  @IsString() @MaxLength(2000) reason!: string;
}
