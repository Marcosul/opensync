import { simpleGit } from 'simple-git';

export async function initGit(workspaceDir: string): Promise<void> {
  const git = simpleGit(workspaceDir);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
  }
}

export async function commitAll(workspaceDir: string, message: string): Promise<string> {
  const git = simpleGit(workspaceDir);
  await git.add('.');
  const result = await git.commit(message);
  return result.commit;
}

export async function pushToApi(workspaceDir: string, apiUrl: string, token: string): Promise<void> {
  const git = simpleGit(workspaceDir);
  const remote = `${apiUrl}`;
  await git.env('GIT_ASKPASS', 'echo').addConfig('http.extraHeader', `Authorization: Bearer ${token}`);
  await git.push(remote, 'main', ['--force-with-lease']);
}
