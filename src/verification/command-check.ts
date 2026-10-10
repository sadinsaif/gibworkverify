import { spawn } from 'node:child_process';
import type { CheckOutcome } from './engine.js';

/**
 * Command execution + the safety model around it.
 *
 * SECURITY MODEL
 *   1. Commands are ONLY ever taken from the local `.verity/config.json` that
 *      the developer controls — never from untrusted bounty text.
 *   2. A denylist of dangerous patterns (rm -rf, sudo, curl | sh, git push,
 *      disk/format ops, fork bombs, …) is REFUSED outright and never executed.
 *   3. Commands matching a conservative safe allowlist run without prompting.
 *   4. Anything else requires explicit authorization (an interactive y/N
 *      prompt, or the `--yes` flag). Without authorization it is SKIPPED, never
 *      silently run.
 */

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_MAX_BUFFER = 1024 * 1024; // 1 MiB per stream
const DEFAULT_TIMEOUT = 600_000; // 10 minutes

/** Patterns that are categorically refused — never executed. */
const DANGEROUS: readonly RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f/i,
  /\brm\s+-[a-z]*f[a-z]*r/i,
  /\bsudo\b/i,
  /\bdoas\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bchmod\s+-R\b/i,
  /\bchmod\s+[0-7]*7{3}\b/i,
  /\bchown\s+-R\b/i,
  /\b(?:curl|wget)\b[^|]*\|\s*(?:sh|bash|zsh|pwsh|powershell)/i,
  /\b(?:sh|bash|zsh)\s+-c\b[^\n]*\b(?:curl|wget)\b/i,
  />\s*\/dev\/(?:sd|null|zero|random)/i,
  /:\s*\(\s*\)\s*\{.*\}\s*;?\s*:/, // fork bomb
  /\b(?:shutdown|reboot|halt|poweroff)\b/i,
  /\bgit\s+push\b/i,
  /\bformat\b\s+[a-z]:/i,
  /\bdel\s+\/[sqf]/i,
  /\brmdir\s+\/s/i,
];

/** Conservative allowlist of command prefixes that need no confirmation. */
const SAFE_PREFIXES: readonly string[] = [
  'npm test',
  'npm run',
  'npm ci',
  'npm install',
  'npx tsc',
  'npx vitest',
  'npx eslint',
  'tsc',
  'vitest',
  'jest',
  'mocha',
  'pnpm ',
  'yarn ',
  'pytest',
  'cargo test',
  'cargo build',
  'go test',
  'go build',
  'make test',
  'make build',
  'make check',
];

/** Returns the matched dangerous pattern source, or null if the command is allowed. */
export function dangerousReason(command: string): string | null {
  for (const re of DANGEROUS) {
    if (re.test(command)) return re.source;
  }
  return null;
}

/** True if the command matches the no-prompt safe allowlist. */
export function isAllowlisted(command: string): boolean {
  const trimmed = command.trim();
  return SAFE_PREFIXES.some((p) => trimmed === p.trim() || trimmed.startsWith(p));
}

function clip(buf: string, chunk: Buffer, max: number): string {
  const next = buf + chunk.toString('utf8');
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Spawn a process, capturing output with a hard cap and a kill-on-timeout. */
export function capture(
  command: string,
  args: string[] | undefined,
  useShell: boolean,
  opts: RunOptions = {},
): Promise<CommandResult> {
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const start = Date.now();

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args ?? [], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: useShell,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = clip(stdout, chunk, maxBuffer);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = clip(stderr, chunk, maxBuffer);
    });

    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, durationMs: Date.now() - start, timedOut });
    });
  });
}

/** Run a full command line through the system shell (used for configured checks). */
export function runShell(command: string, opts: RunOptions = {}): Promise<CommandResult> {
  return capture(command, undefined, true, opts);
}

/** Run an executable with explicit argv and NO shell (used for `git`). */
export function runArgv(file: string, args: string[], opts: RunOptions = {}): Promise<CommandResult> {
  return capture(file, args, false, opts);
}

/** Keep only the last `n` meaningful lines of some text. */
export function tailLines(text: string, n: number): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\s+$/u, '').split('\n');
  return lines.length <= n ? lines.join('\n') : lines.slice(lines.length - n).join('\n');
}

export interface CommandCheckSpec {
  id: string;
  type: 'command' | 'test';
  description: string;
  command?: string;
}

export interface CommandCheckContext {
  cwd: string;
  /** Decide whether a non-allowlisted command may run (prompt / --yes). */
  authorize: (command: string) => Promise<boolean>;
  timeoutMs?: number;
}

/**
 * Run one configured command check and map it to a VerificationResult.
 * Exit code 0 ⇒ PASS; non-zero ⇒ FAIL; refused/unauthorized ⇒ FAIL/SKIP.
 * A PASS is only ever returned when the command actually ran to a 0 exit.
 */
export async function commandCheck(
  spec: CommandCheckSpec,
  ctx: CommandCheckContext,
): Promise<CheckOutcome> {
  const base = { id: spec.id, type: spec.type, description: spec.description };

  if (!spec.command || !spec.command.trim()) {
    return {
      ...base,
      status: 'SKIP',
      evidence: 'No command configured for this check.',
      durationMs: 0,
      error: null,
    };
  }

  const command = spec.command.trim();

  const danger = dangerousReason(command);
  if (danger) {
    return {
      ...base,
      status: 'FAIL',
      evidence: `Refused to run a dangerous command: ${command}`,
      durationMs: 0,
      error: `Command matched a blocked pattern (${danger}) and was not executed.`,
    };
  }

  if (!isAllowlisted(command)) {
    const ok = await ctx.authorize(command);
    if (!ok) {
      return {
        ...base,
        status: 'SKIP',
        evidence: `Command not authorized (re-run with --yes to allow): ${command}`,
        durationMs: 0,
        error: null,
      };
    }
  }

  let result: CommandResult;
  try {
    result = await runShell(command, { cwd: ctx.cwd, timeoutMs: ctx.timeoutMs });
  } catch (err) {
    return {
      ...base,
      status: 'FAIL',
      evidence: `Command could not be launched: ${command}`,
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const detail = {
    command,
    exitCode: result.code,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutTail: tailLines(result.stdout, 50),
    stderrTail: tailLines(result.stderr, 50),
  };

  if (result.timedOut) {
    return {
      ...base,
      status: 'FAIL',
      evidence: `Command timed out: ${command}`,
      durationMs: result.durationMs,
      error: 'Timed out',
      detail,
    };
  }

  const passed = result.code === 0;
  return {
    ...base,
    status: passed ? 'PASS' : 'FAIL',
    evidence: `${command} exited ${result.code} in ${result.durationMs}ms`,
    durationMs: result.durationMs,
    error: passed ? null : `Exit code ${result.code}`,
    detail,
  };
}
