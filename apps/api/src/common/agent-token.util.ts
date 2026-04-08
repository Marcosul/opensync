import { createHash } from 'node:crypto';

/** SHA-256 hex do token completo (ex.: osk_…); deve coincidir com `agents.token_hash`. */
export function hashAgentBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Extrai o segredo do header `Authorization: Bearer …`. */
export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization || typeof authorization !== 'string') {
    return null;
  }
  const m = authorization.match(/^\s*Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t || null;
}
