import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import {
  workspaceExists,
  loadConfigOrNull,
  loadBountyOrNull,
  loadChecklistOrNull,
  loadSubmissionOrNull,
  fileExists,
} from '../storage/state.js';
import type { Runtime } from './context.js';

/** Summarize the local `.verity/` workspace state. Reads local files only. */
export async function statusCmd(rt: Runtime): Promise<void> {
  const exists = workspaceExists(rt.paths);
  const config = exists ? loadConfigOrNull(rt.paths) : null;
  const bounty = exists ? loadBountyOrNull(rt.paths) : null;
  const checklist = exists ? loadChecklistOrNull(rt.paths) : null;
  const submission = exists ? loadSubmissionOrNull(rt.paths) : null;

  const data = {
    workspace: exists ? rt.paths.root : null,
    bounty: bounty ? { taskId: bounty.taskId, title: bounty.title, status: bounty.status } : null,
    criteria: checklist ? checklist.criteria.length : 0,
    readiness: checklist ? checklist.readiness : null,
    checks: config ? config.checks.length : 0,
    proof: fileExists(rt.paths.proof),
    report: fileExists(rt.paths.reportMd),
    submission: submission ? { intentId: submission.intentId, status: submission.status } : null,
  };

  if (rt.json) {
    emitJson(data);
    return;
  }

  if (!exists) {
    info(c.dim('No .verity workspace here. Run `verity init`.'));
    return;
  }

  info(section('verity status'));
  info(kv('workspace', rt.paths.root, 12));
  info(kv('bounty', bounty ? `${bounty.title} (${bounty.taskId})` : c.dim('not linked'), 12));
  info(kv('status', bounty ? bounty.status : c.dim('—'), 12));
  info(kv('criteria', String(data.criteria), 12));
  if (checklist) {
    info(kv('readiness', `${checklist.readiness.verifiable}/${checklist.readiness.total} (${checklist.readiness.score})`, 12));
  }
  info(kv('checks', String(data.checks), 12));
  info(kv('proof', data.proof ? c.green('present') : c.dim('none'), 12));
  info(kv('report', data.report ? c.green('present') : c.dim('none'), 12));
  info(kv('submission', submission ? `${submission.status} (${submission.intentId})` : c.dim('none'), 12));
}
