import { runChecks, summarize } from '../verification/engine.js';
import { loadConfig } from '../storage/state.js';
import { ExitCode } from '../utils/errors.js';
import { info } from '../utils/logger.js';
import { emitJson, section } from '../utils/output.js';
import { printResults } from './verify.js';
import type { Runtime } from './context.js';

/**
 * Run the locally-configured executable checks (no manual-criteria markers).
 * `verity verify` is the fuller command that also surfaces manual criteria.
 */
export async function checkCmd(rt: Runtime, filterId?: string): Promise<void> {
  const config = loadConfig(rt.paths);
  const results = await runChecks(config.checks, {
    cwd: rt.config.cwd,
    authorize: rt.authorizeCommand,
    timeoutMs: rt.config.timeoutMs,
    ...(filterId ? { filterId } : {}),
  });
  const summary = summarize(results);

  if (rt.json) {
    emitJson({ verification: summary });
  } else {
    info(section('verity check'));
    if (summary.total === 0) {
      info('  No configured checks. Run `verity bounty init <TASK_ID>` to seed them.');
    } else {
      printResults(summary);
    }
  }
  if (summary.failed > 0) process.exitCode = ExitCode.VerificationFailure;
}
