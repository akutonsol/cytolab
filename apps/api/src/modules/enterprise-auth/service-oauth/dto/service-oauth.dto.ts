import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Program 7 · Phase 7A.2b — DTOs. The token endpoint accepts ONLY `grant_type=client_credentials` (no other grant).
 * `client_secret` is validated for presence only and never logged/echoed. Admin DTOs assign an EXISTING permission
 * code as a scope (D5) — no second scope language.
 */
export class ClientCredentialsTokenDto {
  @IsIn(['client_credentials']) grant_type!: 'client_credentials';
  @IsString() @MinLength(1) @MaxLength(128) client_id!: string; // the globally-unique ServicePrincipal.principalUuid
  @IsString() @MinLength(1) @MaxLength(512) client_secret!: string;
}

export class AssignScopeDto {
  @IsString() @MinLength(3) @MaxLength(128) permissionCode!: string; // an EXISTING catalogue permission (e.g. "record:view")
}
