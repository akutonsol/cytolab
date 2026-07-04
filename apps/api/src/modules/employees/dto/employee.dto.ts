import { EmploymentType } from '@prisma/client';
import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateEmployeeDto {
  @IsString() @IsNotEmpty() userId!: string;
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsNotEmpty() @MaxLength(40) employeeNo!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) jobTitle!: string;
  @IsEnum(EmploymentType) @IsOptional() employmentType?: EmploymentType;
  @IsDateString() startDate!: string;
  @IsDateString() @IsOptional() endDate?: string;
  @IsInt() @Min(0) @IsOptional() salary?: number;
  @IsString() @IsOptional() @MaxLength(120) bankName?: string;
  @IsString() @IsOptional() @MaxLength(60) bankAccount?: string;
  @IsString() @IsOptional() @MaxLength(120) bankBranch?: string;
  @IsString() @IsOptional() @MaxLength(40) trn?: string;
  @IsString() @IsOptional() @MaxLength(40) nis?: string;
  @IsString() @IsOptional() @MaxLength(40) nht?: string;
  @IsString() @IsOptional() @MaxLength(120) emergencyContactName?: string;
  @IsString() @IsOptional() @MaxLength(40) emergencyContactPhone?: string;
  @IsString() @IsOptional() @MaxLength(400) address?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() isFixedSalary?: boolean;
}

export class UpdateEmployeeDto {
  @IsString() @IsOptional() departmentId?: string | null;
  @IsString() @IsOptional() @MaxLength(40) employeeNo?: string;
  @IsString() @IsOptional() @MaxLength(120) jobTitle?: string;
  @IsEnum(EmploymentType) @IsOptional() employmentType?: EmploymentType;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string | null;
  @IsInt() @Min(0) @IsOptional() salary?: number;
  @IsString() @IsOptional() @MaxLength(120) bankName?: string;
  @IsString() @IsOptional() @MaxLength(60) bankAccount?: string;
  @IsString() @IsOptional() @MaxLength(120) bankBranch?: string;
  @IsString() @IsOptional() @MaxLength(40) trn?: string;
  @IsString() @IsOptional() @MaxLength(40) nis?: string;
  @IsString() @IsOptional() @MaxLength(40) nht?: string;
  @IsString() @IsOptional() @MaxLength(120) emergencyContactName?: string;
  @IsString() @IsOptional() @MaxLength(40) emergencyContactPhone?: string;
  @IsString() @IsOptional() @MaxLength(400) address?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() isFixedSalary?: boolean;
}

export class EmployeeQueryDto extends PaginationDto {
  @IsString() @IsOptional() departmentId?: string;
  @IsString() @IsOptional() search?: string;
}
