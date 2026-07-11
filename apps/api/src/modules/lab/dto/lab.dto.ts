import { IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Company profile (Settings > General > Company). All fields optional so the
 * pane can PATCH-style save any subset; empty strings are normalised to null in
 * the service so the UI can clear a field.
 */
export class UpdateLabProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Kept short so it fits the one-line dashboard slot beside the wordmark.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  // Empty string clears the field; only validate as an email when non-empty.
  @IsOptional()
  @ValidateIf((o) => o.email !== undefined && o.email !== '')
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
