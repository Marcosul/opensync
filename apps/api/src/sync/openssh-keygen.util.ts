import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type OpensshKeyPair = {
  /** Uma linha ssh-ed25519 AAAA... */
  publicKeyLine: string;
  /** PEM OpenSSH completo */
  privateKeyPem: string;
};

/**
 * Gera par ed25519 em formato OpenSSH (Gitea deploy keys exigem linha ssh-ed25519 / PEM privado).
 * Requer `ssh-keygen` no PATH (pacote openssh-client na imagem Docker).
 */
export function generateOpensshEd25519KeyPair(comment: string): OpensshKeyPair {
  const safeComment = comment.replace(/[\r\n]/g, '').slice(0, 80) || 'opensync-vault';
  const dir = mkdtempSync(join(tmpdir(), 'opensync-ssh-'));
  const base = join(dir, 'key');
  try {
    execFileSync(
      'ssh-keygen',
      ['-t', 'ed25519', '-N', '', '-C', safeComment, '-f', base],
      { stdio: 'ignore' },
    );
    const privateKeyPem = readFileSync(base, 'utf8');
    const publicKeyLine = readFileSync(`${base}.pub`, 'utf8').trim();
    if (!publicKeyLine.startsWith('ssh-ed25519 ')) {
      throw new Error('Chave publica inesperada (esperado ssh-ed25519)');
    }
    return { publicKeyLine, privateKeyPem };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
