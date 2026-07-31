import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Program 7 · Phase 7B.2 — issue a staff invitation (admin). No password is set by the admin (Model C / L6). */
export class IssueInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;
}

/** Public acceptance: the opaque token (only the high-entropy token — Clarification 3) + the invitee's chosen password. */
export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password!: string;
}
