import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateCabinetDto {
  @IsString() @IsNotEmpty() label!: string;
  @IsString() @IsOptional() identifier?: string;
  @IsString() @IsOptional() color?: string;
}

export class UpdateCabinetDto {
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() identifier?: string;
  @IsString() @IsOptional() color?: string;
}

export class CabinetRecordsQueryDto extends PaginationDto {}
