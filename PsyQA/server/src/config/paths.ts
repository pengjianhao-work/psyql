import fs from 'fs';
import path from 'path';

/** Absolute path to `PsyQA/server/` */
export const SERVER_ROOT = path.resolve(path.join(__dirname, '..', '..'));

/** Absolute path to `PsyQA/` (repo app root, parent of server/) */
export const APP_ROOT = path.resolve(path.join(SERVER_ROOT, '..'));

export function serverDataPath(...segments: string[]): string {
  return path.join(SERVER_ROOT, 'data', ...segments);
}

export function serverPath(...segments: string[]): string {
  return path.join(SERVER_ROOT, ...segments);
}

export function appPath(...segments: string[]): string {
  return path.join(APP_ROOT, ...segments);
}

export function firstExistingPath(...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Resolve a file under `server/data/`, with cwd fallback for scripts. */
export function resolveDataFile(name: string): string {
  const primary = serverDataPath(name);
  const fromCwd = path.join(process.cwd(), 'server', 'data', name);
  return firstExistingPath(primary, fromCwd) ?? primary;
}

export function userHistoryJsonPath(): string {
  return (
    firstExistingPath(
      serverPath('user_history.json'),
      appPath('user_history.json'),
      path.join(SERVER_ROOT, 'src', 'user_history.json')
    ) ?? serverPath('user_history.json')
  );
}

export function psyqaFullJsonPath(): string {
  return (
    firstExistingPath(appPath('PsyQA_full.json'), path.join(process.cwd(), 'PsyQA_full.json')) ??
    appPath('PsyQA_full.json')
  );
}

export function vectorDbPath(): string {
  return (
    firstExistingPath(appPath('vector_db'), serverPath('vector_db')) ?? appPath('vector_db')
  );
}
