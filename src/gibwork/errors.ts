import {
  GibworkApiError,
  GibworkTimeoutError,
  GibworkNetworkError,
  GibworkValidationError,
  GibworkConfigurationError,
  GibworkAmbiguousSubmitError,
  GibworkSubmissionOperationError,
  GibworkProtocolError,
} from '@gibwork/sdk';
import { VerityError, ExitCode } from '../utils/errors.js';

/**
 * Translate @gibwork/sdk errors into VerityError with the right exit code.
 * Kept inside src/gibwork/ so the SDK import stays isolated here.
 *
 * Ordering matters: several network errors subclass GibworkNetworkError, so the
 * more specific classes are checked first.
 */

function apiMessage(err: GibworkApiError): string {
  const body = err.body as { message?: string | string[]; error?: string } | undefined;
  const detail = Array.isArray(body?.message) ? body?.message.join('; ') : body?.message;
  return detail || body?.error || `Gibwork API error (HTTP ${err.status})`;
}

export function mapGibworkError(err: unknown): VerityError {
  // Pass through anything already classified (e.g. a config error from wallet resolution).
  if (err instanceof VerityError) return err;

  if (err instanceof GibworkAmbiguousSubmitError) {
    return new VerityError(
      'The submission transaction outcome is ambiguous. Do NOT resubmit blindly — ' +
        'recover with `verity submission status <intentId>` using the saved intent.',
      {
        code: 'AMBIGUOUS_SUBMIT',
        exitCode: ExitCode.AmbiguousTransaction,
        details: { ...err.context },
        cause: err,
      },
    );
  }

  if (err instanceof GibworkTimeoutError) {
    return new VerityError('Request timed out contacting Gibwork.', {
      code: 'TIMEOUT',
      exitCode: ExitCode.Network,
      cause: err,
    });
  }

  if (err instanceof GibworkNetworkError) {
    return new VerityError(`Network error contacting Gibwork: ${err.message}`, {
      code: 'NETWORK',
      exitCode: ExitCode.Network,
      cause: err,
    });
  }

  if (err instanceof GibworkApiError) {
    return new VerityError(apiMessage(err), {
      code: 'GIBWORK_API',
      exitCode: ExitCode.GibworkApi,
      details: {
        status: err.status,
        ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
        ...(err.requestId ? { requestId: err.requestId } : {}),
      },
      cause: err,
    });
  }

  if (err instanceof GibworkValidationError) {
    return new VerityError(`Invalid request: ${err.message}`, {
      code: 'VALIDATION',
      exitCode: ExitCode.InvalidInput,
      cause: err,
    });
  }

  if (err instanceof GibworkConfigurationError) {
    return new VerityError(`Gibwork client misconfigured: ${err.message}`, {
      code: 'GIBWORK_CONFIG',
      exitCode: ExitCode.Config,
      cause: err,
    });
  }

  if (err instanceof GibworkSubmissionOperationError) {
    // Non-ambiguous submission failure; recover identifiers are retained.
    return new VerityError(`Submission could not be completed: ${err.message}`, {
      code: 'SUBMISSION_FAILED',
      exitCode: ExitCode.GibworkApi,
      details: { ...err.context },
      cause: err,
    });
  }

  if (err instanceof GibworkProtocolError) {
    return new VerityError(`Unexpected Gibwork response: ${err.message}`, {
      code: 'PROTOCOL',
      exitCode: ExitCode.GibworkApi,
      cause: err,
    });
  }

  if (err instanceof Error) {
    return new VerityError(err.message, {
      code: 'GIBWORK_ERROR',
      exitCode: ExitCode.GibworkApi,
      cause: err,
    });
  }
  return new VerityError('Unknown Gibwork error', {
    code: 'GIBWORK_ERROR',
    exitCode: ExitCode.GibworkApi,
  });
}
