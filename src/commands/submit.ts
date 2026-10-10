import { randomUUID } from 'node:crypto';
import { taskIdFromInput } from '../gibwork/tasks.js';
import {
  prepareSubmission,
  submitPrepared,
  getIntentStatus,
  isFulfilled,
  describeIntentState,
} from '../gibwork/submissions.js';
import { runFullVerification, type FullVerification } from './verify.js';
import { generateProof } from './prove.js';
import { generateReport } from './report.js';
import type { Proof } from '../proof/schema.js';
import {
  loadSubmissionOrNull,
  saveSubmission,
  type SubmissionRecord,
} from '../storage/state.js';
import { redact } from '../evidence/sanitizer.js';
import { verificationFailed, invalidInput } from '../utils/errors.js';
import { info, c } from '../utils/logger.js';
import { confirm, emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

export interface SubmitOptions {
  demo?: string;
  link?: string[];
}

/** Build the concise, PUBLIC submission content. Redacted before use. */
function buildSubmissionContent(
  full: FullVerification,
  proof: Proof,
  opts: SubmitOptions,
): string {
  const lines: string[] = [];
  lines.push('<p>Submitted and verified with <strong>gibwork-verity</strong>.</p>');
  lines.push('<ul>');
  lines.push(
    `<li>Verification: ${full.summary.passed} passed, ${full.summary.failed} failed, ${full.summary.warnings} warning(s)</li>`,
  );
  if (full.git.commit) {
    lines.push(`<li>Commit: ${full.git.commit}${full.git.branch ? ` (${full.git.branch})` : ''}</li>`);
  }
  if (full.git.remote) lines.push(`<li>Repository: ${full.git.remote}</li>`);
  lines.push(`<li>Evidence root hash (SHA-256): ${proof.rootHash}</li>`);
  if (opts.demo) lines.push(`<li>Demo: ${opts.demo}</li>`);
  for (const link of opts.link ?? []) lines.push(`<li>Link: ${link}</li>`);
  lines.push('</ul>');
  // Defense-in-depth: never let a secret reach a public submission.
  return redact(lines.join('\n'));
}

export async function submitCmd(taskIdArg: string, rt: Runtime, opts: SubmitOptions): Promise<void> {
  const taskId = taskIdFromInput(taskIdArg);

  // 1. Verify and require all mandatory checks to pass.
  const full = await runFullVerification(rt);
  if (full.summary.mandatoryFailed > 0) {
    throw verificationFailed(
      `${full.summary.mandatoryFailed} mandatory check(s) failed — refusing to submit. Fix them and re-run.`,
    );
  }

  // 2. Generate proof + report (reusing the verification we just ran).
  const { proof } = await generateProof(rt, full);
  await generateReport(rt, full, proof);

  // 3. Build the submission payload and show exactly what will be sent.
  const content = buildSubmissionContent(full, proof, opts);
  info(section('Submission payload'));
  info(content);
  info('');
  info(
    c.yellow(
      'This performs a REAL, paid on-chain submission (a small USDC participation fee) and cannot be undone.',
    ),
  );

  // 4. Require a user-provided, funded wallet (never the ephemeral read-only key).
  const gw = rt.gibwork({ requireProvidedWallet: true });

  // 5. Idempotency: reuse the saved key for this task so retries don't double-pay.
  const existing = loadSubmissionOrNull(rt.paths);
  const reuse = existing && existing.taskId === taskId;
  const idempotencyKey = reuse ? existing.idempotencyKey : randomUUID();
  const stamp = () => new Date().toISOString();

  // Persist a pre-payment record BEFORE anything is sent (recovery-first).
  let record: SubmissionRecord = {
    schemaVersion: '1.0',
    taskId,
    intentId: reuse ? existing.intentId : '',
    taskSubmissionId: reuse ? existing.taskSubmissionId : null,
    paymentAttemptId: reuse ? existing.paymentAttemptId : null,
    idempotencyKey,
    status: 'preparing',
    txHash: null,
    environment: rt.config.environment,
    walletAddress: gw.wallet.publicKey,
    createdAt: reuse ? existing.createdAt : stamp(),
    updatedAt: stamp(),
  };
  saveSubmission(rt.paths, record);

  // 6. Explicit confirmation before the financial/remote mutation.
  const ok = await confirm('Submit to Gibwork now?', { assumeYes: rt.config.assumeYes });
  if (!ok) {
    info(c.yellow('Aborted — no submission was sent. (Re-run with --yes to confirm non-interactively.)'));
    if (rt.json) emitJson({ submitted: false, reason: 'not confirmed', rootHash: proof.rootHash });
    return;
  }

  // 7. Prepare the intent; persist its identifiers immediately.
  const intent = await prepareSubmission(gw, taskId, { content, idempotencyKey });
  record = {
    ...record,
    intentId: intent.intentId,
    paymentAttemptId: intent.paymentAttemptId ?? null,
    taskSubmissionId: intent.taskSubmissionId ?? null,
    status: intent.status,
    txHash: intent.txHash ?? null,
    updatedAt: stamp(),
  };
  saveSubmission(rt.paths, record);

  // 8. Sign + submit exactly once (no blind retry). Ambiguity → exit code 22.
  const final = await submitPrepared(gw, taskId, intent);
  record = {
    ...record,
    intentId: final.intentId,
    paymentAttemptId: final.paymentAttemptId ?? record.paymentAttemptId,
    taskSubmissionId: final.taskSubmissionId ?? record.taskSubmissionId,
    status: final.status,
    txHash: final.txHash ?? null,
    updatedAt: stamp(),
  };
  saveSubmission(rt.paths, record);

  const fulfilled = isFulfilled(final);
  if (rt.json) {
    emitJson({
      submitted: true,
      intentId: final.intentId,
      status: final.status,
      fulfilled,
      txHash: final.txHash ?? null,
      rootHash: proof.rootHash,
    });
    return;
  }
  info('');
  info(section('Submission result'));
  info(kv('intent', final.intentId, 10));
  info(kv('status', fulfilled ? c.green(final.status) : c.yellow(final.status), 10));
  info(`  ${describeIntentState(final.status)}`);
  if (final.txHash) info(kv('tx', final.txHash, 10));
}

export async function submissionStatusCmd(intentId: string, rt: Runtime): Promise<void> {
  const record = loadSubmissionOrNull(rt.paths);
  if (!record || record.intentId !== intentId) {
    throw invalidInput(
      `No local record for intent "${intentId}". The Gibwork SDK recovers an intent by (taskId, intentId); ` +
        'run this from the workspace that created it, with the original wallet.',
    );
  }

  // Recovery must use the ORIGINAL submitting wallet.
  const gw = rt.gibwork({ requireProvidedWallet: true });
  const intent = await getIntentStatus(gw, record.taskId, intentId);

  saveSubmission(rt.paths, {
    ...record,
    status: intent.status,
    txHash: intent.txHash ?? record.txHash,
    taskSubmissionId: intent.taskSubmissionId ?? record.taskSubmissionId,
    updatedAt: new Date().toISOString(),
  });

  if (rt.json) {
    emitJson({
      taskId: record.taskId,
      intentId,
      status: intent.status,
      fulfilled: isFulfilled(intent),
      txHash: intent.txHash ?? null,
    });
    return;
  }
  info(section('submission status'));
  info(kv('task', record.taskId, 10));
  info(kv('intent', intentId, 10));
  info(kv('status', intent.status, 10));
  info(`  ${describeIntentState(intent.status)}`);
}
