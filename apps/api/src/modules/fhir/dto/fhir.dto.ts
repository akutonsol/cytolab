import { EMRSystem, FHIRAuthType, TransmissionStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEndpointDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(500) baseUrl!: string;
  @IsEnum(EMRSystem) system!: EMRSystem;
  @IsEnum(FHIRAuthType) authType!: FHIRAuthType;
  @IsOptional() @IsString() @MaxLength(2000) authToken?: string;
  @IsOptional() @IsString() @MaxLength(200) clientId?: string;
  @IsOptional() @IsString() @MaxLength(500) clientSecret?: string;
  @IsOptional() @IsBoolean() isSandbox?: boolean;
}

export class UpdateEndpointDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) baseUrl?: string;
  @IsOptional() @IsEnum(EMRSystem) system?: EMRSystem;
  @IsOptional() @IsEnum(FHIRAuthType) authType?: FHIRAuthType;
  @IsOptional() @IsString() @MaxLength(2000) authToken?: string;
  @IsOptional() @IsString() @MaxLength(200) clientId?: string;
  @IsOptional() @IsString() @MaxLength(500) clientSecret?: string;
  @IsOptional() @IsBoolean() isSandbox?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TransmitDto {
  @IsString() endpointId!: string;
}

export class TransmissionQueryDto {
  @IsOptional() @IsEnum(TransmissionStatus) status?: TransmissionStatus;
  @IsOptional() @IsString() endpointId?: string;
}
