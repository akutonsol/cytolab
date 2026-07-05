import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewScreeningDto {
  @IsBoolean() agreedWithAI!: boolean;
  @IsOptional() @IsString() @MaxLength(2000) pathologistNote?: string;
}
