import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ChangeRequestStatus, ChangeRequestType } from '@prisma/client';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class CreateChangeRequestDto {
  @IsEnum(ChangeRequestType) type!: ChangeRequestType;
  @IsString() @IsNotEmpty() @MaxLength(200) subject!: string;
  // Optional record this request is about (must belong to the client).
  @IsString() @IsOptional() recordId?: string;
  // The opening message of the thread.
  @IsString() @IsNotEmpty() message!: string;
}

export class CreatePortalMessageDto {
  @IsString() @IsNotEmpty() body!: string;
}

export class PortalChangeRequestQueryDto extends PaginationDto {
  @IsEnum(ChangeRequestStatus) @IsOptional() status?: ChangeRequestStatus;
}
