import { createInterface } from 'node:readline/promises';
import { isJsonMode, c } from './logger.js';

/**
 * Rendering + stdout envelope helpers, and the interactive confirmation prompt.
 */

/** Emit the stable success envelope to stdout. */
export function emitJson(data: unknown): void {
  process.stdout.write(JSON.stringify({ ok: true, data }, null, 2) + '\n');
}

/** Emit the stable error envelope to stdout. */
export function emitJsonError(code: string, message: string): void {
  process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }, null, 2) + '\n');
}

/** A dim section heading string (write via logger.info). */
export function section(title: string): string {
  return c.bold(title);
}

/** A padded `label  value` line. */
export function kv(label: string, value: string | number, pad = 10): string {
  return `  ${c.dim(label.padEnd(pad))} ${value}`;
}

/** A simple two-space-separated, left-aligned table with an optional header. */
export function table(rows: string[][], header?: string[]): string {
  const all = header ? [header, ...rows] : rows;
  const widths: number[] = [];
  for (const row of all) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  const render = (row: string[]): string =>
    row.map((cell, i) => cell.padEnd(i === row.length - 1 ? 0 : (widths[i] ?? 0))).join('  ');
  const lines: string[] = [];
  if (header) {
    lines.push('  ' + c.dim(render(header)));
  }
  for (const row of rows) {
    lines.push('  ' + render(row));
  }
  return lines.join('\n');
}

export interface ConfirmOptions {
  /** When true, skip the prompt and return true (the `--yes` flag). */
  assumeYes?: boolean;
}

/**
 * Ask the user a yes/no question on stderr and read the answer from stdin.
 *
 * Safe by default:
 *   - `assumeYes` (the `--yes` flag) short-circuits to true.
 *   - In --json mode or when stdin is not a TTY, there is no safe way to prompt;
 *     this returns false so the caller can refuse the action with a clear error.
 */
export async function confirm(question: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (opts.assumeYes) return true;
  if (isJsonMode() || !process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
