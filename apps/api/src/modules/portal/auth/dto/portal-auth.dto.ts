import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() password!: string;
}

export class PortalRefreshDto {
  @IsString() @IsNotEmpty() refreshToken!: string;
}

export class ResetRequestDto {
  @IsEmail() email!: string;
}

// Used for both accept-invite (first password) and password reset.
export class SetPasswordDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsString() @MinLength(8) password!: string;
}
