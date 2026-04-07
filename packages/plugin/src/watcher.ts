import chokidar, { FSWatcher } from 'chokidar';
import { commitAll } from './git';
import { sync } from './sync';

let watcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function startWatcher(
  workspaceDir: string,
  token: string,
  vaultId?: string,
): Promise<void> {
  watcher = chokidar.watch(workspaceDir, {
    ignored: /(^|[/\\])\..|(^|[/\\])node_modules/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('all', (event, filePath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const filename = filePath.replace(workspaceDir, '').replace(/^\//, '');
      await commitAll(workspaceDir, `auto: ${filename} ${event}`);
      await sync(workspaceDir, token, vaultId);
    }, 1000);
  });
}

export async function stopWatcher(): Promise<void> {
  if (debounceTimer) clearTimeout(debounceTimer);
  await watcher?.close();
  watcher = null;
}
