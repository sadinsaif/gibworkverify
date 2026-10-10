/**
 * Output stream discipline.
 *
 * Convention:
 *   - Machine-readable JSON (`--json`) is the ONLY thing written to STDOUT.
 *   - All human progress, headings, warnings, and errors go to STDERR, so a
 *     consumer piping `--json` always gets clean, parseable stdout.
 */

let jsonMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Human-facing line. Suppressed in --json mode so stdout stays clean. */
export function info(msg = ''): void {
  if (!jsonMode) process.stderr.write(msg + '\n');
}

/** Human-facing line, always shown on stderr (even in --json mode). */
export function warn(msg: string): void {
  process.stderr.write(msg + '\n');
}

/** Error line, always on stderr. */
export function errline(msg: string): void {
  process.stderr.write(msg + '\n');
}

// Small ANSI helpers (no dependency). Disabled when NO_COLOR is set or stderr
// is not a TTY.
const useColor = !process.env.NO_COLOR && Boolean(process.stderr.isTTY);
const wrap =
  (code: string) =>
  (s: string | number): string =>
    useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s);

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
};
