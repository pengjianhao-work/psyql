import fs from 'fs';
import path from 'path';

const locks = new Map<string, Promise<void>>();

async function acquireLock(filePath: string): Promise<() => void> {
  const key = path.resolve(filePath);
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, prev.then(() => next));
  await prev;
  return () => {
    release();
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  };
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  const release = await acquireLock(filePath);
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  } finally {
    release();
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const release = await acquireLock(filePath);
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } finally {
    release();
  }
}

export function readJsonFileSync<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFileSync<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
