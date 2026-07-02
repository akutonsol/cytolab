import { IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AppointmentStatus, AppointmentType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AppointmentQueryDto extends PaginationDto {
  /** Filter to a single day (any ISO date/time; the whole calendar day is matched). */
  @IsDateString() @IsOptional() date?: string;
  @IsEnum(AppointmentType) @IsOptional() type?: AppointmentType;
  @IsEnum(AppointmentStatus) @IsOptional() status?: AppointmentStatus;
}

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsEnum(AppointmentType) @IsOptional() type?: AppointmentType;
  @IsEnum(AppointmentStatus) @IsOptional() status?: AppointmentStatus;
  @IsDateString() scheduledAt!: string;
  @IsInt() @Min(5) @IsOptional() @Type(() => Number) duration?: number;
  @IsString() @IsOptional() patientId?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() assignedUserId?: string;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateAppointmentDto {
  @IsString() @IsNotEmpty() @IsOptional() title?: string;
  @IsEnum(AppointmentType) @IsOptional() type?: AppointmentType;
  @IsEnum(AppointmentStatus) @IsOptional() status?: AppointmentStatus;
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsInt() @Min(5) @IsOptional() @Type(() => Number) duration?: number;
  @IsString() @IsOptional() patientId?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsString() @IsOptional() assignedUserId?: string;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateStatusDto {
  @IsEnum(AppointmentStatus) status!: AppointmentStatus;
}
