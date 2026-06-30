import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateServiceDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsOptional() description?: string;
  // price in minor units (cents)
  @IsInt() @Min(0) @Type(() => Number) price!: number;
  @IsBoolean() @IsOptional() active?: boolean;
}

export class ServiceQueryDto extends PaginationDto {
  @IsString() @IsOptional() q?: string;
}
