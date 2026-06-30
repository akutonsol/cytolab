import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTaxDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsOptional() code?: string;
  // basis points; 1% = 100
  @IsInt() @Min(0) @Type(() => Number) rateBasisPoints!: number;
  @IsBoolean() @IsOptional() isDefault?: boolean;
}
