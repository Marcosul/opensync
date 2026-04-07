import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVaultDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  path?: string;
}
