import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class CreatePortalUserDto {
  @IsString() @IsNotEmpty() clientId!: string;
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
}

export class PortalUserQueryDto extends PaginationDto {
  @IsString() @IsOptional() clientId?: string;
}
