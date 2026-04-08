/**
 * Nome inicial do workspace: parte local do email + "'s Workspace" (máx. 120 caracteres).
 */
export function defaultWorkspaceNameFromEmail(email: string | null | undefined): string {
  const raw = (email?.split('@')[0] ?? '').trim();
  const base = raw || 'user';
  const truncated = base.slice(0, 108);
  const full = `${truncated}'s Workspace`;
  return full.slice(0, 120);
}
