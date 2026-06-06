import * as fs from 'fs';
import * as path from 'path';

const startedAt = new Date().toISOString();

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export const BUILD_INFO = {
  version: readPackageVersion(),
  startedAt,
  nodeVersion: process.version
};
