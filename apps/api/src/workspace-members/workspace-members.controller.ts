import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspaceMembersService } from './workspace-members.service';

@Controller('workspaces/:workspaceId/members')
export class WorkspaceMembersController {
  constructor(private readonly membersService: WorkspaceMembersService) {}

  private requireUserId(userId: string | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      throw new UnauthorizedException('Usuário ausente (x-opensync-user-id)');
    }
    return normalized;
  }

  @Get()
  async list(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
  ) {
    const uid = this.requireUserId(userId);
    const members = await this.membersService.listMembers(uid, workspaceId.trim());
    return { members };
  }

  @Patch(':memberId')
  async updateRole(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    const uid = this.requireUserId(userId);
    const member = await this.membersService.updateMemberRole(
      uid,
      workspaceId.trim(),
      memberId.trim(),
      body.role as WorkspaceRole,
    );
    return { member };
  }

  @Delete(':memberId')
  async remove(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
  ) {
    const uid = this.requireUserId(userId);
    return this.membersService.removeMember(uid, workspaceId.trim(), memberId.trim());
  }
}
