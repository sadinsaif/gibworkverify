import fs from 'node:fs';
import path from 'node:path';

/**
 * Detect sensible default verification commands from a target repo's
 * package.json. Used by `verity bounty init` to SEED the local config with
 * suggested commands — the developer reviews and edits them before running.
 * This never executes anything.
 */

interface PackageJson {
  scripts?: Record<string, string>;
}

function readPackageJson(cwd: string): PackageJson | null {
  const file = path.join(cwd, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

const PLACEHOLDER_TEST = /no test specified/i;

/** Prefer `npm test`, then a test-ish script, else null. */
export function detectTestCommand(cwd: string): string | null {
  const pkg = readPackageJson(cwd);
  const scripts = pkg?.scripts ?? {};
  if (scripts.test && !PLACEHOLDER_TEST.test(scripts.test)) return 'npm test';
  for (const name of Object.keys(scripts)) {
    if (/(^|:)test($|:)/.test(name)) return `npm run ${name}`;
  }
  return null;
}

/** Prefer `npm run build`, then typecheck/lint as a build-ish gate, else null. */
export function detectBuildCommand(cwd: string): string | null {
  const pkg = readPackageJson(cwd);
  const scripts = pkg?.scripts ?? {};
  for (const name of ['build', 'compile', 'typecheck', 'type-check', 'lint']) {
    if (scripts[name]) return `npm run ${name}`;
  }
  return null;
}
