import { ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ThreadType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ThreadQueryDto extends PaginationDto {
  @IsEnum(ThreadType) @IsOptional() type?: ThreadType;
}

export class UserQueryDto {
  @IsString() @IsOptional() q?: string;
}

export class CreateThreadDto {
  @IsString() @IsOptional() subject?: string;
  @IsEnum(ThreadType) @IsOptional() type?: ThreadType;
  /** Staff participants to add (besides the creator). Required for INTERNAL. */
  @IsArray() @IsString({ each: true }) @ArrayUnique() @IsOptional() userIds?: string[];
  /** The client a CLIENT thread is about. Required when type = CLIENT. */
  @IsString() @IsOptional() clientId?: string;
}

export class SendMessageDto {
  @IsString() @IsNotEmpty() body!: string;
}
