import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

function log(message, color = 'cyan') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function run(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readPortFromEnv(filePath, fallbackPort) {
  try {
    if (!existsSync(filePath)) return fallbackPort;
    const envContent = readFileSync(filePath, 'utf8');
    const portLine = envContent
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('PORT='));

    if (!portLine) return fallbackPort;
    const parsed = Number(portLine.slice('PORT='.length).trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackPort;
  } catch {
    return fallbackPort;
  }
}

function isPortBusy(port) {
  const output = run(`ss -ltn '( sport = :${port} )'`);
  return output.includes(`:${port}`);
}

function killPort(port) {
  const lsofPids = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`)
    .split('\n')
    .map((pid) => pid.trim())
    .filter(Boolean);

  if (lsofPids.length > 0) {
    for (const pid of lsofPids) {
      run(`kill -9 ${pid}`);
      log(`✅ Processo ${pid} finalizado na porta ${port}`, 'green');
    }
  }

  if (isPortBusy(port)) {
    run(`fuser -k -n tcp ${port}`);
  }

  if (isPortBusy(port)) {
    log(`❌ Porta ${port} continua ocupada após limpeza`, 'red');
    process.exitCode = 1;
  } else if (lsofPids.length === 0) {
    log(`ℹ️ Porta ${port} já está livre`, 'yellow');
  }
}

log('🧹 Limpando ambiente de desenvolvimento...', 'cyan');
const webPort = readPortFromEnv(resolve(process.cwd(), 'apps/web/.env'), 3000);
const apiPort = readPortFromEnv(resolve(process.cwd(), 'apps/api/.env'), 3001);
log(`🔎 Portas configuradas: web=${webPort} api=${apiPort}`, 'cyan');
killPort(webPort);
killPort(apiPort);

if (process.exitCode) {
  log('🛑 Não foi possível liberar todas as portas configuradas.', 'red');
  process.exit(process.exitCode);
}

const nextLockPath = resolve(process.cwd(), 'apps/web/.next/dev/lock');
if (existsSync(nextLockPath)) {
  rmSync(nextLockPath, { force: true });
  log('🔓 Lock do Next removido em apps/web/.next/dev/lock', 'green');
} else {
  log('ℹ️ Sem lock stale do Next para remover', 'yellow');
}

log('🚀 Ambiente pronto para subir com turbo dev', 'cyan');
