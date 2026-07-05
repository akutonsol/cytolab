import { AppointmentStatus, AppointmentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AppointmentQueryDto {
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsEnum(AppointmentType) type?: AppointmentType;
  @IsOptional() @IsString() date?: string; // single-day filter (YYYY-MM-DD)
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() clientId?: string;
}

export class CreateAppointmentDto {
  @IsString() patientId!: string;
  @IsEnum(AppointmentType) appointmentType!: AppointmentType;
  @IsString() scheduledAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) duration?: number;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() @MaxLength(200) doctorName?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() recallRecordId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsEnum(AppointmentType) appointmentType?: AppointmentType;
  @IsOptional() @IsString() scheduledAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) duration?: number;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() @MaxLength(200) doctorName?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(500) cancellationReason?: string;
}

export class CompleteAppointmentDto {
  @IsOptional() @IsString() resultRecordId?: string;
}

export class RescheduleAppointmentDto {
  @IsString() newScheduledAt!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CalendarQueryDto {
  @Type(() => Number) @IsInt() year!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
}
