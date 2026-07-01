import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RecordStatus, RequisitionFormType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// The six folder swatches from the Create Cabinet modal.
export const CABINET_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'yellow'] as const;

export class CreateCabinetDto {
  @IsString() @IsNotEmpty() label!: string;
  @IsIn(CABINET_COLORS) @IsOptional() color?: string;
  // Linking a client makes the cabinet organize all that client's records and
  // generates its reference code. Optional so a folder can be created unlinked.
  @IsString() @IsOptional() clientId?: string;
}

export class UpdateCabinetDto {
  @IsString() @IsOptional() label?: string;
  @IsIn(CABINET_COLORS) @IsOptional() color?: string;
  @IsString() @IsOptional() clientId?: string;
}

// Cabinet contents reuse the Specimen Overview filters + an A–Z surname index.
export class CabinetRecordsQueryDto extends PaginationDto {
  /** First letter of the patient's LAST name; omit ("...") for all. */
  @IsString() @IsOptional() surname?: string;
  @IsEnum(RequisitionFormType) @IsOptional() formType?: RequisitionFormType;
  @IsEnum(RecordStatus) @IsOptional() status?: RecordStatus;
}
