import { describe, it, expect } from 'vitest';
import {
  GibworkApiError,
  GibworkTimeoutError,
  GibworkNetworkError,
  GibworkValidationError,
  GibworkConfigurationError,
  GibworkAmbiguousSubmitError,
} from '@gibwork/sdk';
import { mapGibworkError } from '../../src/gibwork/errors.js';
import { ExitCode, VerityError } from '../../src/utils/errors.js';

describe('mapGibworkError → exit codes', () => {
  it('API error → 20', () => {
    expect(mapGibworkError(new GibworkApiError(400, { message: 'bad' }, 'GET', '/x')).exitCode).toBe(
      ExitCode.GibworkApi,
    );
  });
  it('timeout → 21', () => {
    expect(mapGibworkError(new GibworkTimeoutError('GET', '/x', 1000)).exitCode).toBe(ExitCode.Network);
  });
  it('network → 21', () => {
    expect(mapGibworkError(new GibworkNetworkError('down', 'GET', '/x')).exitCode).toBe(ExitCode.Network);
  });
  it('validation → 2', () => {
    expect(mapGibworkError(new GibworkValidationError('nope')).exitCode).toBe(ExitCode.InvalidInput);
  });
  it('configuration → 10', () => {
    expect(mapGibworkError(new GibworkConfigurationError('nope')).exitCode).toBe(ExitCode.Config);
  });
  it('ambiguous submit → 22', () => {
    const err = new GibworkAmbiguousSubmitError('POST', '/x', {
      operation: 'create-submission',
      intentId: 'i',
    });
    const mapped = mapGibworkError(err);
    expect(mapped.exitCode).toBe(ExitCode.AmbiguousTransaction);
    expect(mapped.code).toBe('AMBIGUOUS_SUBMIT');
  });
  it('passes a VerityError through unchanged', () => {
    const original = new VerityError('x', { code: 'CONFIG', exitCode: ExitCode.Config });
    expect(mapGibworkError(original)).toBe(original);
  });
});
