import { AiModelLifecycleState } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/; // stable human key; lowercase slug
const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Create a registry model. `key` is the stable human slug; the permanent identity (modelUuid) is server-assigned. */
export class CreateAiModelDto {
  @IsString() @Matches(SLUG) key!: string;
  @IsString() @MaxLength(160) displayName!: string;
  @IsString() @MaxLength(200) task!: string; // descriptive purpose — NEVER a clinical/diagnostic claim
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** Mutable descriptive metadata only — never key, modelUuid, or any version provenance. */
export class UpdateAiModelDto {
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(200) task?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** Create an immutable model version. Provenance is a reference/digest only — never weights/binaries, never PHI. */
export class CreateAiModelVersionDto {
  @IsInt() @Min(0) semverMajor!: number;
  @IsInt() @Min(0) semverMinor!: number;
  @IsInt() @Min(0) semverPatch!: number;
  @IsOptional() @IsString() @Matches(SHA256_HEX) artifactDigest?: string;
  @IsOptional() @IsString() @MaxLength(2048) provenanceRef?: string;
}

/** Request a lifecycle transition; the service enforces legality (RETIRED terminal). Reason must carry no PHI. */
export class TransitionAiModelVersionDto {
  @IsEnum(AiModelLifecycleState) toState!: AiModelLifecycleState;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
