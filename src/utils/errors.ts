/**
 * Typed errors and documented process exit codes.
 *
 * This module is intentionally SDK-agnostic. The translation of @gibwork/sdk
 * errors into VerityError lives in `src/gibwork/errors.ts`, so the Gibwork SDK
 * stays isolated behind `src/gibwork/`.
 */

/** Documented exit codes (see README → Exit codes). */
export const ExitCode = {
  Success: 0,
  /** A verification check failed (or a general, unclassified failure). */
  VerificationFailure: 1,
  /** Bad user input: unknown task id/URL, malformed flag, etc. */
  InvalidInput: 2,
  /** Local configuration or credential/wallet problem. */
  Config: 10,
  /** Gibwork API returned an error response. */
  GibworkApi: 20,
  /** Network/timeout error contacting Gibwork. */
  Network: 21,
  /** A remote transaction's outcome is ambiguous — do NOT blindly retry. */
  AmbiguousTransaction: 22,
  /** Interrupted (SIGINT). */
  Interrupted: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface VerityErrorOptions {
  /** Stable machine code surfaced in the JSON error envelope. */
  code: string;
  /** Process exit code. */
  exitCode: number;
  /** Extra non-secret context (e.g. recovery identifiers). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

/** The single error type the CLI layer understands. */
export class VerityError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, opts: VerityErrorOptions) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'VerityError';
    this.code = opts.code;
    this.exitCode = opts.exitCode;
    this.details = opts.details;
  }
}

export function invalidInput(message: string, details?: Record<string, unknown>): VerityError {
  return new VerityError(message, { code: 'INVALID_INPUT', exitCode: ExitCode.InvalidInput, details });
}

export function configError(message: string, details?: Record<string, unknown>): VerityError {
  return new VerityError(message, { code: 'CONFIG', exitCode: ExitCode.Config, details });
}

export function verificationFailed(message: string, details?: Record<string, unknown>): VerityError {
  return new VerityError(message, {
    code: 'VERIFICATION_FAILED',
    exitCode: ExitCode.VerificationFailure,
    details,
  });
}

/** Resolve the exit code for any thrown value. Unknown errors are a general failure (1). */
export function exitCodeFor(err: unknown): number {
  if (err instanceof VerityError) return err.exitCode;
  return ExitCode.VerificationFailure;
}

/** Normalize any thrown value into a `{ code, message }` pair for the JSON envelope. */
export function errorEnvelope(err: unknown): { code: string; message: string } {
  if (err instanceof VerityError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: 'ERROR', message: err.message };
  return { code: 'ERROR', message: String(err) };
}
