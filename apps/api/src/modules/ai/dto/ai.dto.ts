import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsBoolean() @IsOptional() enabled?: boolean;
  @IsString() @IsOptional() houseStyle?: string;
  @IsIn(['Strict', 'Standard']) @IsOptional() redactionPolicy?: 'Strict' | 'Standard';
  @IsString() @IsOptional() model?: string;
}

export class AcceptNarrativeDto {
  // The authorizer's reviewed/edited text — this, not the raw AI output, is what
  // feeds the report.
  @IsString() @IsNotEmpty() finalText!: string;
}
