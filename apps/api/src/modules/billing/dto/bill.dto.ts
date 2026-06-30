import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateBillLineDto {
  @IsString() @IsNotEmpty() serviceId!: string;
  @IsInt() @Min(1) @Type(() => Number) quantity!: number;
  @IsString() @IsOptional() description?: string;
}

export class CreateBillDto {
  @IsString() @IsNotEmpty() recordId!: string;
  @IsString() @IsOptional() clientId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateBillLineDto)
  lines!: CreateBillLineDto[];

  // Tax ids to apply; if omitted, the lab's default taxes are applied.
  @IsArray() @IsOptional() @IsString({ each: true }) taxIds?: string[];

  @IsDate() @IsOptional() @Type(() => Date) dueDate?: Date;
}

export class BillQueryDto extends PaginationDto {
  @IsEnum(BillStatus) @IsOptional() status?: BillStatus;
}
