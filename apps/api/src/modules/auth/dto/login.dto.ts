import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class MfaChallengeDto {
  @IsString()
  @IsNotEmpty()
  mfaToken!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class MfaSendDto {
  @IsString()
  @IsNotEmpty()
  mfaToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class RegisterLabDto {
  // bootstrap: creates a Lab + its first Superuser
  @IsString()
  @IsNotEmpty()
  labName!: string;

  @IsString()
  @IsNotEmpty()
  labSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;
}
