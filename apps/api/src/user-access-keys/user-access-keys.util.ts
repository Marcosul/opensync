import { createHash, randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { parseBearerToken } from '../common/agent-token.util';

export function generateUserApiKey(): { token: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const token = `usk_${raw}`;
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  return { token, hash };
}

export async function resolveUserWithApiKey(
  prisma: PrismaService,
  authorization: string | undefined,
): Promise<{ userId: string; email: string }> {
  const bearer = parseBearerToken(authorization);
  if (!bearer) {
    throw new UnauthorizedException('Authorization: Bearer usk_... obrigatorio');
  }

  const keyHash = createHash('sha256').update(bearer, 'utf8').digest('hex');

  const row = await prisma.userApiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    select: {
      id: true,
      profile: { select: { id: true, email: true } },
    },
  });

  if (!row?.profile) {
    throw new UnauthorizedException('Token de acesso invalido ou revogado');
  }

  // Atualizar lastUsedAt de forma assíncrona (não bloqueia)
  void prisma.userApiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.profile.id, email: row.profile.email };
}
