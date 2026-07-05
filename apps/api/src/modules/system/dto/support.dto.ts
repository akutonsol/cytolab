import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  SubmitterType,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// ─── Tickets ──────────────────────────────────────────────────────────────

export class CreateTicketDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(3) description!: string;
  @IsEnum(TicketCategory) category!: TicketCategory;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsString() assignedToId?: string;
}

/** Public (unauthenticated) client/consultant submission. labId comes from the body. */
export class PublicCreateTicketDto {
  @IsString() labId!: string;
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(3) description!: string;
  @IsEnum(TicketCategory) category!: TicketCategory;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsString() @MinLength(2) submitterName!: string;
  @IsEmail() submitterEmail!: string;
  @IsEnum(SubmitterType) submitterType!: SubmitterType; // CLIENT or CONSULTANT (validated in service)
}

export class UpdateTicketDto {
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() resolutionNotes?: string;
}

export class AssignTicketDto {
  @IsString() assignedToId!: string;
}

export class ResolveTicketDto {
  @IsOptional() @IsString() resolutionNotes?: string;
}

export class TicketQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsEnum(TicketCategory) category?: TicketCategory;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsEnum(SubmitterType) submitterType?: SubmitterType;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}

// ─── Comments ─────────────────────────────────────────────────────────────

export class CreateCommentDto {
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
}

// ─── Maintenance windows ──────────────────────────────────────────────────

export class CreateMaintenanceWindowDto {
  @IsString() @MinLength(3) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() scheduledAt!: string; // ISO datetime
  @IsInt() @Min(1) @Type(() => Number) durationMinutes!: number;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) affectedSystems!: string[];
  @IsOptional() @IsBoolean() notifyUsers?: boolean;
  @IsOptional() @IsString() ticketId?: string;
}

export class UpdateMaintenanceWindowDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() scheduledAt?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) durationMinutes?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) affectedSystems?: string[];
  @IsOptional() @IsBoolean() notifyUsers?: boolean;
  @IsOptional() @IsString() status?: string; // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
}

// ─── Announcements ────────────────────────────────────────────────────────

export class CreateAnnouncementDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsString() type?: string; // INFO | WARNING | CRITICAL
  @IsOptional() @IsString() showFrom?: string;
  @IsOptional() @IsString() showUntil?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() showFrom?: string;
  @IsOptional() @IsString() showUntil?: string;
}
