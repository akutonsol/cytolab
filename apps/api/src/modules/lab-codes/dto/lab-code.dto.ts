import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabCodeDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsOptional() region?: string;
}
