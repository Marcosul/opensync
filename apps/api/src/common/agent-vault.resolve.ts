import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { hashAgentBearerToken, parseBearerToken } from './agent-token.util';

type AgentVaultRow = {
  id: string;
  giteaRepo: string;
  name: string;
};

export async function resolveVaultWithAgentBearer(
  prisma: PrismaService,
  vaultId: string,
  authorization: string | undefined,
): Promise<{ agentId: string; vault: AgentVaultRow }> {
  const bearer = parseBearerToken(authorization);
  if (!bearer) {
    throw new UnauthorizedException('Cabeçalho Authorization: Bearer obrigatorio');
  }
  const tokenHash = hashAgentBearerToken(bearer);
  const row = await prisma.agent.findFirst({
    where: {
      vaultId,
      tokenHash,
    },
    select: {
      id: true,
      vault: {
        select: {
          id: true,
          giteaRepo: true,
          name: true,
        },
      },
    },
  });
  if (!row?.vault) {
    throw new UnauthorizedException('Token ou vault invalidos');
  }
  return { agentId: row.id, vault: row.vault };
}
