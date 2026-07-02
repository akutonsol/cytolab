import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateFieldDto {
  @IsString() @IsNotEmpty() @IsOptional() label?: string;
  @IsBoolean() @IsOptional() showWhenPrinting?: boolean;
  // Empty string / null clears the print-group assignment.
  @IsString() @IsOptional() printGroupId?: string | null;
  @IsInt() @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class AddPrintGroupDto {
  @IsString() @IsNotEmpty() name!: string;
}
