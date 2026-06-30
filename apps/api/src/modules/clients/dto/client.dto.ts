import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ClientTypeEnum } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateClientTypeDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEnum(ClientTypeEnum) type!: ClientTypeEnum;
}

export class CreateClientDto {
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() officeName?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() officeNumber?: string;
  @IsString() @IsOptional() faxNumber?: string;
  @IsString() @IsOptional() clientTypeId?: string;
}

export class UpdateClientDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() officeName?: string;
  @IsString() @IsOptional() phoneNumber?: string;
  @IsString() @IsOptional() mobileNumber?: string;
  @IsString() @IsOptional() officeNumber?: string;
  @IsString() @IsOptional() faxNumber?: string;
  @IsString() @IsOptional() clientTypeId?: string;
}

export class ClientQueryDto extends PaginationDto {
  @IsString() @IsOptional() q?: string;
}
