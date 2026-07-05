import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSlideDto {
  @IsString() @MaxLength(2000) slideUrl!: string;
  @IsOptional() @IsString() @MaxLength(40) format?: string;
  @IsOptional() @IsString() @MaxLength(40) magnification?: string;
  @IsOptional() @IsString() @MaxLength(80) stain?: string;
  @IsOptional() @IsString() @MaxLength(120) scanner?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fileSizeBytes?: number;
}

export class CreateAnnotationDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) x!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) y!: number;
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}

export class UpdateAnnotationDto {
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}
