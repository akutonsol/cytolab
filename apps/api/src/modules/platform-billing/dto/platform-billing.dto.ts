import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LabInvoiceStatus } from '@prisma/client';

export class BillingItemDto {
  @IsString() @MaxLength(200) description!: string;
  @IsInt() @Min(1) @Type(() => Number) quantity!: number;
  // Unit price in minor units (cents).
  @IsInt() @Min(0) @Type(() => Number) unitPrice!: number;
}

export class UpsertBillingProfileDto {
  @IsBoolean() @IsOptional() active?: boolean;
  @IsInt() @Min(1) @Max(28) @IsOptional() @Type(() => Number) billingDayOfMonth?: number;
  @IsInt() @Min(0) @Max(120) @IsOptional() @Type(() => Number) dueDays?: number;
  @IsBoolean() @IsOptional() autoSend?: boolean;
  @IsString() @IsOptional() @MaxLength(8) currency?: string;
  @IsString() @IsOptional() @MaxLength(1000) notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BillingItemDto)
  items?: BillingItemDto[];
}

export class InvoiceStatusDto {
  // Terminal/lifecycle status a superuser sets manually (Sent/Paid/Void). Draft
  // and Overdue are system-managed but accepted for completeness.
  @IsEnum(LabInvoiceStatus) status!: LabInvoiceStatus;
}

export class InvoiceQueryDto {
  @IsEnum(LabInvoiceStatus) @IsOptional() status?: LabInvoiceStatus;
  @IsString() @IsOptional() labId?: string;
}
