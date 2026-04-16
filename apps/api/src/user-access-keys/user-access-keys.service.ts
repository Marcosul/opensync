import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { generateUserApiKey } from './user-access-keys.util';

@Injectable()
export class UserAccessKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, label?: string) {
    const { token, hash } = generateUserApiKey();

    const row = await this.prisma.userApiKey.create({
      data: {
        userId,
        label: label ?? 'Token de acesso',
        keyHash: hash,
      },
      select: { id: true, label: true },
    });

    return { token, id: row.id, label: row.label };
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.userApiKey.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  async revokeForUser(userId: string, keyId: string) {
    const row = await this.prisma.userApiKey.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });
    if (!row) throw new NotFoundException('Token nao encontrado');
    await this.prisma.userApiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
