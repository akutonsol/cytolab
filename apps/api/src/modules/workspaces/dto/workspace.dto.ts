import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateWorkspaceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  // Optional — defaults to the lab's account when omitted.
  @IsString() @IsOptional() accountId?: string;
}

export class UpdateWorkspaceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
}

export class WorkspaceQueryDto extends PaginationDto {}
