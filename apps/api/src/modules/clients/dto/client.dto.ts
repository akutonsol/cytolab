import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientTypeEnum } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateClientTypeDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEnum(ClientTypeEnum) type!: ClientTypeEnum;
}

export class ClientAddressDto {
  @IsString() @IsOptional() label?: string;
  @IsString() @IsNotEmpty() line1!: string;
  @IsString() @IsOptional() line2?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() region?: string;
  @IsString() @IsOptional() postalCode?: string;
  @IsString() @IsOptional() country?: string;
}

export class CreateClientDto {
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() officeName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() officeNumber?: string;
  @IsString() @IsOptional() faxNumber?: string;
  @IsString() @IsOptional() clientTypeId?: string;
  @IsString() @IsOptional() labCodeId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsBoolean() @IsOptional() blocked?: boolean;
  @IsString() @IsOptional() avatarUrl?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ClientAddressDto) @IsOptional()
  addresses?: ClientAddressDto[];

  // Auth Information — creates the client's PORTAL login by emailing an invite.
  // No password is ever accepted here (Finding 2, option B); the client sets it
  // via the emailed setup link. Provisioning fires only when this is true.
  @IsBoolean() @IsOptional() createPortalLogin?: boolean;
  @IsBoolean() @IsOptional() twoFactorEnabled?: boolean;
}

export class UpdateClientDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() officeName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() officeNumber?: string;
  @IsString() @IsOptional() faxNumber?: string;
  @IsString() @IsOptional() clientTypeId?: string;
  @IsString() @IsOptional() labCodeId?: string;
  @IsString() @IsOptional() workspaceId?: string;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsBoolean() @IsOptional() blocked?: boolean;
  @IsString() @IsOptional() avatarUrl?: string;
  // When provided, replaces the client's address set.
  @IsArray() @ValidateNested({ each: true }) @Type(() => ClientAddressDto) @IsOptional()
  addresses?: ClientAddressDto[];
}

export class ClientQueryDto extends PaginationDto {
  @IsString() @IsOptional() q?: string;
}
