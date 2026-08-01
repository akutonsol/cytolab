import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Program 7 · Phase 7B.3 — SCIM request DTOs. SCIM 2.0 payloads are polymorphic (RFC 7643/7644), so the controller runs
 * a permissive pipe (unknown protocol fields such as `schemas`/`meta` are preserved, never stripped) and the SERVICE
 * performs the authoritative semantic validation + deterministic conflict handling. These DTOs bound the fields the
 * service reads. NO password field is accepted (7B.3 performs no password management — L6/binding-constraint 11).
 */

/** SCIM `name` sub-attribute (RFC 7643 §4.1.1). */
export class ScimNameDto {
  @IsOptional() @IsString() @MaxLength(100) givenName?: string;
  @IsOptional() @IsString() @MaxLength(100) familyName?: string;
  @IsOptional() @IsString() @MaxLength(201) formatted?: string;
}

/** POST /Users + PUT /Users/{id} (full resource). `active` defaults to true at create when omitted. */
export class ScimUserWriteDto {
  @IsOptional() @IsArray() schemas?: string[];
  @IsOptional() @IsString() @MaxLength(320) userName?: string;
  @IsOptional() @IsString() @MaxLength(320) externalId?: string;
  @IsOptional() name?: ScimNameDto;
  @IsOptional() @IsArray() emails?: Array<{ value?: string; primary?: boolean; type?: string }>;
  @IsOptional() @IsBoolean() active?: boolean;
  // Accepted-but-ignored protocol/echo fields (never authorization): groups are ignored (S9), meta is server-owned.
  @IsOptional() @IsArray() groups?: unknown[];
  @IsOptional() meta?: unknown;
}

/** A single RFC 7644 §3.5.2 PatchOp operation. */
export class ScimPatchOperationDto {
  @IsString() op!: string; // add | replace | remove (case-insensitive)
  @IsOptional() @IsString() @MaxLength(256) path?: string;
  @IsOptional() value?: unknown;
}

/** PATCH /Users/{id} — RFC 7644 §3.5.2 PatchOp request. */
export class ScimPatchDto {
  @IsOptional() @IsArray() schemas?: string[];
  @IsArray() Operations!: ScimPatchOperationDto[];
}

/** GET /Users query — baseline supports `filter` (eq on userName/externalId) + 1-based pagination. */
export class ScimListQueryDto {
  @IsOptional() @IsString() @MaxLength(256) filter?: string;
  @IsOptional() @IsString() startIndex?: string;
  @IsOptional() @IsString() count?: string;
}
