import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateReportDto {
  @IsString() @IsNotEmpty() resultSheetId!: string;
  @IsString() @IsOptional() content?: string;
  @IsString() @IsOptional() authorizerReference?: string;
  @IsString() @IsOptional() signature?: string;
  @IsString() @IsOptional() digitalSignature?: string;
  @IsString() @IsOptional() medicalEntry?: string;
}

export class ReportQueryDto extends PaginationDto {
  @IsString() @IsOptional() resultSheetId?: string;
}
