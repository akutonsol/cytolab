import { IsEnum, IsOptional } from 'class-validator';
import { RecordStatus } from '@prisma/client';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class PortalRecordQueryDto extends PaginationDto {
  @IsEnum(RecordStatus) @IsOptional() status?: RecordStatus;
}
