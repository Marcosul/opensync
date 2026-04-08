import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVaultDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  /** Se omitido, usa o workspace "Default" do utilizador. */
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  path?: string;
}
