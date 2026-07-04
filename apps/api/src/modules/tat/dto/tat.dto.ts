import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTATConfigDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsString() @IsOptional() @MaxLength(60) specimenType?: string;
  @IsInt() @Min(1) thresholdHours!: number;
  @IsInt() @Min(0) @IsOptional() warningHours?: number;
  @IsInt() @Min(1) @IsOptional() urgentThresholdHours?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateTATConfigDto {
  @IsString() @IsOptional() @MaxLength(120) name?: string;
  @IsString() @IsOptional() @MaxLength(60) specimenType?: string | null;
  @IsInt() @Min(1) @IsOptional() thresholdHours?: number;
  @IsInt() @Min(0) @IsOptional() warningHours?: number;
  @IsInt() @Min(1) @IsOptional() urgentThresholdHours?: number | null;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class AlertQueryDto {
  @IsString() @IsOptional() status?: string; // Open | Acknowledged | Resolved
  @IsString() @IsOptional() level?: string; // Approaching | Breached
}
