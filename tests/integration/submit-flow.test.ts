import { describe, it, expect } from 'vitest';
import { GibworkAmbiguousSubmitError } from '@gibwork/sdk';
import { prepareSubmission, submitPrepared, isFulfilled } from '../../src/gibwork/submissions.js';
import { ExitCode } from '../../src/utils/errors.js';
import { fakeGibworkRuntime, makeIntent } from '../helpers.js';

describe('submission flow (mocked Gibwork client)', () => {
  it('prepares, signs, and submits to a fulfilled intent', async () => {
    let signed = '';
    const rt = fakeGibworkRuntime({
      prepareCreate: async () => makeIntent({ status: 'pending' }),
      submitCreate: async (_t, _i, input) => {
        signed = input.signedTransaction;
        return makeIntent({ status: 'fulfilled', txHash: 'tx123' });
      },
    });

    const intent = await prepareSubmission(rt, 'task-1', { content: 'done', idempotencyKey: 'k1' });
    const final = await submitPrepared(rt, 'task-1', intent);

    expect(signed).toBe('signed:BASE64_TX');
    expect(isFulfilled(final)).toBe(true);
    expect(final.txHash).toBe('tx123');
  });

  it('never retries an ambiguous submit and surfaces exit code 22', async () => {
    const rt = fakeGibworkRuntime({
      submitCreate: async () => {
        throw new GibworkAmbiguousSubmitError('POST', '/submit', {
          operation: 'create-submission',
          intentId: 'intent-1',
        });
      },
    });
    const intent = makeIntent({ status: 'pending' });
    await expect(submitPrepared(rt, 'task-1', intent)).rejects.toMatchObject({
      exitCode: ExitCode.AmbiguousTransaction,
    });
  });

  it('does not pay when the intent is not a signable pending intent', async () => {
    let submitCalled = false;
    const rt = fakeGibworkRuntime({
      submitCreate: async () => {
        submitCalled = true;
        return makeIntent();
      },
    });
    const intent = makeIntent({ status: 'submitted', serializedTransaction: undefined });
    const out = await submitPrepared(rt, 'task-1', intent);
    expect(out.status).toBe('submitted');
    expect(submitCalled).toBe(false);
  });
});
