import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class NotificationQueryDto extends PaginationDto {
  // ?read=false to fetch only unread. Accepts true/false strings from the query.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  read?: boolean;
}

// Internal payload for NotificationsHelper.create — never bound to a public route.
export class CreateNotificationDto {
  @IsString() userId!: string;
  @IsEnum(NotificationType) type!: NotificationType;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsString() @IsOptional() link?: string;
  @IsString() @IsOptional() entityId?: string;
  @IsString() @IsOptional() entityType?: string;
}
