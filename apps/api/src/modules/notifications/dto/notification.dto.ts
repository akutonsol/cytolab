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

// Settings > General > Notification — per-user delivery preferences. Every
// field optional so the pane can save any subset of toggles.
export class UpdateNotificationPreferencesDto {
  @IsBoolean() @IsOptional() recordsInApp?: boolean;
  @IsBoolean() @IsOptional() recordsEmail?: boolean;
  @IsBoolean() @IsOptional() requestsInApp?: boolean;
  @IsBoolean() @IsOptional() requestsEmail?: boolean;
  @IsBoolean() @IsOptional() paymentsInApp?: boolean;
  @IsBoolean() @IsOptional() paymentsEmail?: boolean;
  @IsBoolean() @IsOptional() systemInApp?: boolean;
  @IsBoolean() @IsOptional() systemEmail?: boolean;
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
