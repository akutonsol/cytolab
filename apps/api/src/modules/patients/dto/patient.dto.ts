import {
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreatePatientDto {
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() middleName?: string;
  @IsInt() @IsOptional() @Min(0) @Type(() => Number) age?: number;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsEnum(Gender) @IsOptional() gender?: Gender;
  @IsNumber() @IsOptional() height?: number;
  @IsNumber() @IsOptional() weight?: number;
  @IsEmail() @IsOptional() email?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateOfBirth?: Date;
  @IsString() @IsOptional() identityToken?: string;
  @IsString() @IsOptional() motherMaidenName?: string;
  @IsString() @IsOptional() clientId?: string;
}

export class UpdatePatientDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsInt() @IsOptional() @Min(0) @Type(() => Number) age?: number;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsEnum(Gender) @IsOptional() gender?: Gender;
  @IsNumber() @IsOptional() height?: number;
  @IsNumber() @IsOptional() weight?: number;
  @IsEmail() @IsOptional() email?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateOfBirth?: Date;
  @IsString() @IsOptional() identityToken?: string;
  @IsString() @IsOptional() motherMaidenName?: string;
  @IsString() @IsOptional() clientId?: string;
}

export class PatientQueryDto extends PaginationDto {
  @IsString() @IsOptional() q?: string;
  @IsString() @IsOptional() clientId?: string;
}
