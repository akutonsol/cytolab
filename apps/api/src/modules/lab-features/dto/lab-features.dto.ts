import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ToggleFeatureDto {
  /** The lab whose feature is being toggled (superuser may manage multiple labs). */
  @IsString()
  labId!: string;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
