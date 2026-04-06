import { commitAll } from './git';
import { sync } from './sync';

export async function cmdSync(ctx: { workspaceDir: string; token: string }): Promise<string> {
  await commitAll(ctx.workspaceDir, 'manual: /sync command');
  await sync(ctx.workspaceDir, ctx.token);
  return 'Sync concluído.';
}

export async function cmdStatus(_ctx: { workspaceDir: string }): Promise<string> {
  return 'opensync: ativo e sincronizando.';
}

export async function cmdRollback(ctx: { workspaceDir: string; token: string; hash: string }): Promise<string> {
  await fetch(`${process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space'}/git/rollback`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitHash: ctx.hash }),
  });
  return `Rollback para ${ctx.hash} solicitado.`;
}
