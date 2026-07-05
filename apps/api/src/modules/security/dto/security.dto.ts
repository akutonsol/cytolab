import {
  IsBoolean,
  IsInt,
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class AddBlockedIpDto {
  @IsIP()
  ipAddress!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
}

export class RequireMfaDto {
  @IsBoolean()
  required!: boolean;
}

export class UpdatePasswordPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  minLength?: number;

  @IsOptional()
  @IsBoolean()
  requireUppercase?: boolean;

  @IsOptional()
  @IsBoolean()
  requireLowercase?: boolean;

  @IsOptional()
  @IsBoolean()
  requireNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  requireSpecial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  expiryDays?: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(50)
  maxFailedAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  historyDepth?: number;
}
