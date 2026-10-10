import fs from 'node:fs';
import path from 'node:path';
import type { CheckOutcome } from './engine.js';

/** File/directory existence checks. */

export interface FileCheckSpec {
  id: string;
  description: string;
  path?: string;
}

export async function fileCheck(spec: FileCheckSpec, cwd: string): Promise<CheckOutcome> {
  const base = { id: spec.id, type: 'file' as const, description: spec.description };

  if (!spec.path || !spec.path.trim()) {
    return { ...base, status: 'SKIP', evidence: 'No path configured for this check.', durationMs: 0, error: null };
  }

  const rel = spec.path.trim();
  const abs = path.resolve(cwd, rel);

  try {
    const stat = await fs.promises.stat(abs);
    const kind = stat.isDirectory() ? 'directory' : 'file';
    return {
      ...base,
      status: 'PASS',
      evidence: `${rel} exists (${kind}${stat.isFile() ? `, ${stat.size} bytes` : ''})`,
      durationMs: 0,
      error: null,
      detail: { path: rel, exists: true, isDirectory: stat.isDirectory(), size: stat.isFile() ? stat.size : null },
    };
  } catch {
    return {
      ...base,
      status: 'FAIL',
      evidence: `${rel} not found`,
      durationMs: 0,
      error: `Required path does not exist: ${rel}`,
      detail: { path: rel, exists: false },
    };
  }
}
