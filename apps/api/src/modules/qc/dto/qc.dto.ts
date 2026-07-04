import { EquipmentType, QCCheckType, QCResult } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateQCCheckDto {
  @IsEnum(QCCheckType) checkType!: QCCheckType;
  @IsEnum(QCResult) result!: QCResult;
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsString() recordId?: string;
  @IsOptional() @IsString() @MaxLength(120) batchId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(2000) failureReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) correctiveAction?: string;
  @IsOptional() @IsString() performedAt?: string; // ISO datetime; defaults to now
}

export class UpdateQCCheckDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(2000) correctiveAction?: string;
  @IsOptional() @IsString() @MaxLength(2000) failureReason?: string;
}

export class QCQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(QCCheckType) checkType?: QCCheckType;
  @IsOptional() @IsEnum(QCResult) result?: QCResult;
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsString() performedById?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class ResolveAlertDto {
  @IsOptional() @IsString() @MaxLength(2000) correctiveAction?: string;
}

export class CreateEquipmentDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(EquipmentType) type!: EquipmentType;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() lastServiceDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEquipmentDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(EquipmentType) type?: EquipmentType;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() lastServiceDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
