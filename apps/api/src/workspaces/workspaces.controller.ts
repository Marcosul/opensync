import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  private requireUserId(userId: string | undefined): string {
    const normalized = userId?.trim();
    if (!normalized) {
      throw new UnauthorizedException('Usuário ausente (x-opensync-user-id)');
    }
    return normalized;
  }

  @Get()
  async list(@Headers('x-opensync-user-id') userId: string | undefined) {
    const uid = this.requireUserId(userId);
    const workspaces = await this.workspacesService.listForUser(uid);
    return { workspaces };
  }

  @Post()
  async create(
    @Headers('x-opensync-user-id') userId: string | undefined,
    @Body() body: CreateWorkspaceDto,
  ) {
    const uid = this.requireUserId(userId);
    const workspace = await this.workspacesService.createForUser(uid, body);
    return { workspace };
  }
}
