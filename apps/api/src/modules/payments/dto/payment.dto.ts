import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreatePaymentDto {
  @IsString() @IsNotEmpty() billId!: string;
  // amount in minor units (cents)
  @IsInt() @Min(1) @Type(() => Number) amount!: number;
  @IsEnum(PaymentType) type!: PaymentType;
  @IsString() @IsOptional() referenceNo?: string;
  @IsString() @IsOptional() bank?: string;
  @IsString() @IsOptional() chequeNumber?: string;
}

export class PaymentQueryDto extends PaginationDto {
  @IsString() @IsOptional() billId?: string;
}
