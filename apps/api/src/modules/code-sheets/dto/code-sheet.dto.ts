import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCodeSheetDto {
  @IsString() @IsNotEmpty() abbreviation!: string;
  @IsString() @IsOptional() description?: string;
}

export class CreateCodeFindingDto {
  @IsString() @IsNotEmpty() abbreviation!: string;
  @IsString() @IsOptional() description?: string;
}

export class UpdateCodeSheetDto {
  @IsString() @IsNotEmpty() @IsOptional() abbreviation?: string;
  @IsString() @IsOptional() description?: string;
}

export class UpdateCodeFindingDto {
  @IsString() @IsNotEmpty() @IsOptional() abbreviation?: string;
  @IsString() @IsOptional() description?: string;
}
