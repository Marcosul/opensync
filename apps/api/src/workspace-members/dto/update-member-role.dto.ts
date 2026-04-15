import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
