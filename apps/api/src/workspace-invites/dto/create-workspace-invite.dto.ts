import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

export class CreateWorkspaceInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
