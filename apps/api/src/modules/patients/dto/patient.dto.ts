import {
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PatientAddressDto {
  @IsString() @IsOptional() label?: string;
  @IsString() @IsNotEmpty() line1!: string;
  @IsString() @IsOptional() line2?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() region?: string;
  @IsString() @IsOptional() postalCode?: string;
  @IsString() @IsOptional() country?: string;
}

// NOTE: `age` is intentionally absent — it is derived from dateOfBirth (read-only),
// never accepted as input. `registrationNo` is server-generated, never client-set.
export class CreatePatientDto {
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsEnum(Gender) @IsOptional() gender?: Gender;
  @IsNumber() @IsOptional() height?: number;
  @IsNumber() @IsOptional() weight?: number;
  @IsEmail() @IsOptional() email?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateOfBirth?: Date;
  @IsString() @IsOptional() identityToken?: string;
  @IsString() @IsOptional() motherMaidenName?: string;
  @IsString() @IsOptional() avatarUrl?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatientAddressDto)
  @IsOptional()
  addresses?: PatientAddressDto[];
}

export class UpdatePatientDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() middleName?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsEnum(Gender) @IsOptional() gender?: Gender;
  @IsNumber() @IsOptional() height?: number;
  @IsNumber() @IsOptional() weight?: number;
  @IsEmail() @IsOptional() email?: string;
  @IsDate() @IsOptional() @Type(() => Date) dateOfBirth?: Date;
  @IsString() @IsOptional() identityToken?: string;
  @IsString() @IsOptional() motherMaidenName?: string;
  @IsString() @IsOptional() avatarUrl?: string;
  @IsString() @IsOptional() clientId?: string;
  // When provided, replaces the patient's address set.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatientAddressDto)
  @IsOptional()
  addresses?: PatientAddressDto[];
}

export class PatientQueryDto extends PaginationDto {
  @IsString() @IsOptional() q?: string;
  @IsString() @IsOptional() clientId?: string;
}
