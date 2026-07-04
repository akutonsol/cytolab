import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDepartmentDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() managerId?: string;
}

export class UpdateDepartmentDto {
  @IsString() @IsOptional() @MaxLength(120) name?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() managerId?: string | null;
}

export class DepartmentQueryDto extends PaginationDto {}
