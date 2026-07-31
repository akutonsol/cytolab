import { IdentityProviderProtocol } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Program 7 · Phase 7A.1 — enterprise-authentication administration DTOs. Lab scope is always taken from the JWT
 * principal, never from the body. Registering a provider is INERT config; creating a service principal establishes the
 * non-human principal class. No credentials/secrets/PHI are accepted here (the credential runtime lands with 7A.2).
 */
export class RegisterIdentityProviderDto {
  @IsString() @MinLength(1) @MaxLength(64) key!: string;
  @IsString() @MinLength(1) @MaxLength(128) displayName!: string;
  @IsEnum(IdentityProviderProtocol) protocol!: IdentityProviderProtocol;
  @IsOptional() @IsString() @MaxLength(512) issuer?: string;
}

export class CreateServicePrincipalDto {
  @IsString() @MinLength(1) @MaxLength(64) key!: string;
  @IsString() @MinLength(1) @MaxLength(128) displayName!: string;
}
