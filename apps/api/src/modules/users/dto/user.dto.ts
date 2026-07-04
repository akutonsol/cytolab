import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsArray()
  @IsOptional()
  roleIds?: string[];
}

export class UpdateUserDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsArray() @IsOptional() roleIds?: string[];
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

export class SaveSignatureDto {
  // A PNG data URI (data:image/png;base64,...). Validated more strictly in the
  // service so an actionable error message is returned.
  @IsString() @IsNotEmpty() signatureDataUri!: string;
}
