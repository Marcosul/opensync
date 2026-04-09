import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { generateUserApiKey } from './user-access-keys.util';

@Injectable()
export class UserAccessKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, label?: string) {
    const { token, hash } = generateUserApiKey();

    await this.prisma.userApiKey.create({
      data: {
        userId,
        label: label ?? 'Token de acesso',
        keyHash: hash,
      },
    });

    return { token }; // retornado apenas uma vez
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
