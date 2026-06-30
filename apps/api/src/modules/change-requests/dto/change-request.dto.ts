import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ChangeRequestStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class TransitionChangeRequestDto {
  @IsEnum(ChangeRequestStatus) status!: ChangeRequestStatus;
  @IsString() @IsOptional() @MaxLength(500) note?: string;
}

export class StaffReplyDto {
  @IsString() @IsNotEmpty() body!: string;
}

export class ChangeRequestQueryDto extends PaginationDto {
  @IsEnum(ChangeRequestStatus) @IsOptional() status?: ChangeRequestStatus;
  @IsString() @IsOptional() clientId?: string;
}
