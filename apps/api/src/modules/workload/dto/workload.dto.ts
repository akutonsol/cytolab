import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertTargetDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  dailyTarget?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  weeklyTarget?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
