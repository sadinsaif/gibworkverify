import type { TaskSubmissionIntent, TaskSubmissionIntentStatus, CreateSubmissionInput } from '@gibwork/sdk';
import type { GibworkRuntime } from './client.js';
import { mapGibworkError } from './errors.js';

/**
 * The explicit prepare → sign → submit submission flow, plus intent recovery.
 *
 * Verity NEVER auto-retries a submit. Each step is a distinct call so the CLI
 * can persist recovery identifiers before any payment and reconcile an
 * uncertain outcome with `getIntentStatus` rather than resubmitting blindly.
 *
 * Only the `fulfilled` state confirms a submission was created.
 */

export type { TaskSubmissionIntent, TaskSubmissionIntentStatus };

/** Human-readable meaning of each intent state (from the SDK's documented table). */
export function describeIntentState(status: TaskSubmissionIntentStatus): string {
  switch (status) {
    case 'pending':
      return 'Not submitted. Re-prepare with the same input/key to obtain the transaction.';
    case 'submitted':
      return 'Submitted but unresolved. Read the same intent again later.';
    case 'fulfilled':
      return 'Fee confirmed and submission created.';
    case 'failed':
      return 'Attempt failed. Resolve before choosing a new idempotency key.';
    case 'expired':
      return 'Attempt expired. Resolve before choosing a new idempotency key.';
    case 'requires_review':
      return 'Fee paid; operator attention required. Do NOT pay again — retain the intent id.';
    default:
      return 'Unknown state.';
  }
}

export function isFulfilled(intent: TaskSubmissionIntent): boolean {
  return intent.status === 'fulfilled';
}

export function isTerminal(intent: TaskSubmissionIntent): boolean {
  return intent.status === 'fulfilled' || intent.status === 'failed' || intent.status === 'expired';
}

/** Step 1: prepare a submission intent. Persist its identifiers before paying. */
export async function prepareSubmission(
  rt: GibworkRuntime,
  taskId: string,
  input: CreateSubmissionInput,
): Promise<TaskSubmissionIntent> {
  try {
    return await rt.client.submissions.prepareCreate(taskId, input);
  } catch (err) {
    throw mapGibworkError(err);
  }
}

/**
 * Steps 2 + 3: sign the prepared transaction and submit it ONCE.
 *
 * If the intent is not a signable `pending` intent (e.g. prepare returned an
 * already-submitted intent), it is returned unchanged — there is nothing to pay.
 */
export async function submitPrepared(
  rt: GibworkRuntime,
  taskId: string,
  intent: TaskSubmissionIntent,
): Promise<TaskSubmissionIntent> {
  if (intent.status !== 'pending' || !intent.serializedTransaction) {
    return intent;
  }

  // Local signing — a rejection here is NOT a broadcast payment.
  let signedTransaction: string;
  try {
    signedTransaction = await rt.sign(intent.serializedTransaction);
  } catch (err) {
    throw mapGibworkError(err);
  }

  try {
    return await rt.client.submissions.submitCreate(taskId, intent.intentId, {
      paymentAttemptId: intent.paymentAttemptId,
      signedTransaction,
    });
  } catch (err) {
    // mapGibworkError preserves GibworkAmbiguousSubmitError → exit code 22.
    throw mapGibworkError(err);
  }
}

/** Recovery read: reconcile an intent's current state (never pays). */
export async function getIntentStatus(
  rt: GibworkRuntime,
  taskId: string,
  intentId: string,
): Promise<TaskSubmissionIntent> {
  try {
    return await rt.client.submissions.getIntent(taskId, intentId);
  } catch (err) {
    throw mapGibworkError(err);
  }
}
