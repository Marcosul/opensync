const API_URL = process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space';

export async function sync(workspaceDir: string, token: string): Promise<void> {
  await fetch(`${API_URL}/git/push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceDir }),
  });
}
