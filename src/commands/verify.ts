import {
  runChecks,
  summarize,
  type VerificationResult,
  type VerificationSummary,
} from '../verification/engine.js';
import { collectGitInfo, type GitInfo } from '../verification/git-check.js';
import {
  loadConfig,
  loadChecklistOrNull,
  loadBountyOrNull,
  type VerityConfig,
  type Checklist,
} from '../storage/state.js';
import type { BountySnapshot } from '../gibwork/tasks.js';
import type { Criterion } from '../analyzer/criterion-generator.js';
import { verifyProofFile } from '../proof/integrity.js';
import { ExitCode } from '../utils/errors.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

/** Shared verification result used by verify / check / prove / report / submit. */
export interface FullVerification {
  config: VerityConfig;
  checklist: Checklist | null;
  bounty: BountySnapshot | null;
  git: GitInfo;
  summary: VerificationSummary;
}

/** Manual/informational criteria become WARN/SKIP markers (never auto-PASS). */
function manualResultsFrom(criteria: Criterion[]): VerificationResult[] {
  const out: VerificationResult[] = [];
  for (const cr of criteria) {
    if (cr.type === 'manual' || cr.type === 'informational') {
      out.push({
        id: cr.id,
        type: cr.type,
        status: cr.type === 'manual' ? 'WARN' : 'SKIP',
        description: cr.description,
        evidence: cr.type === 'manual' ? 'Manual review required.' : 'Informational; no automated check.',
        durationMs: 0,
        error: null,
        mandatory: false,
      });
    }
  }
  return out;
}

export async function runFullVerification(rt: Runtime, filterId?: string): Promise<FullVerification> {
  const config = loadConfig(rt.paths);
  const checklist = loadChecklistOrNull(rt.paths);
  const bounty = loadBountyOrNull(rt.paths);

  const engineResults = await runChecks(config.checks, {
    cwd: rt.config.cwd,
    authorize: rt.authorizeCommand,
    timeoutMs: rt.config.timeoutMs,
    ...(filterId ? { filterId } : {}),
  });
  const manual = !filterId && checklist ? manualResultsFrom(checklist.criteria) : [];
  const summary = summarize([...engineResults, ...manual]);
  const git = await collectGitInfo(rt.config.cwd);
  return { config, checklist, bounty, git, summary };
}

function statusMark(status: string): string {
  if (status === 'PASS') return c.green('✓ PASS');
  if (status === 'FAIL') return c.red('✗ FAIL');
  if (status === 'WARN') return c.yellow('! WARN');
  return c.dim('· SKIP');
}

export function printResults(summary: VerificationSummary): void {
  for (const r of summary.results) {
    info(`  ${statusMark(r.status)}  ${c.bold(r.id)}  ${c.dim(r.evidence)}`);
    if (r.error) info(`          ${c.red(r.error)}`);
  }
  info('');
  info(
    `  ${c.green(String(summary.passed))} passed · ${c.red(String(summary.failed))} failed · ${c.yellow(
      String(summary.warnings),
    )} warn · ${summary.skipped} skip  (of ${summary.total})`,
  );
}

export async function verifyCmd(rt: Runtime, filterId?: string): Promise<void> {
  const full = await runFullVerification(rt, filterId);
  if (rt.json) {
    emitJson({
      verification: full.summary,
      repository: { commit: full.git.commit, branch: full.git.branch, clean: full.git.clean },
    });
  } else {
    info(section('verity verify'));
    printResults(full.summary);
  }
  if (full.summary.failed > 0) process.exitCode = ExitCode.VerificationFailure;
}

export function verifyProofCmd(proofFile: string, rt: Runtime): void {
  const result = verifyProofFile(proofFile);
  if (rt.json) {
    emitJson({
      valid: result.valid,
      expectedRootHash: result.expectedRootHash,
      actualRootHash: result.actualRootHash,
      missing: result.missing,
      changed: result.changed,
      items: result.items,
    });
  } else if (result.valid) {
    info(c.green('✓ PROOF VALID'));
    info(kv('root hash', result.expectedRootHash, 12));
    info(kv('evidence', `${result.items.length} item(s), all intact`, 12));
  } else {
    info(c.red('✗ PROOF INVALID'));
    info('');
    info(kv('expected', result.expectedRootHash, 12));
    info(kv('calculated', result.actualRootHash, 12));
    info('');
    if (result.missing.length) info(c.red(`  Missing evidence: ${result.missing.join(', ')}`));
    if (result.changed.length) info(c.red(`  Changed evidence: ${result.changed.join(', ')}`));
    info(c.yellow('  Evidence has changed since the proof was created.'));
  }
  if (!result.valid) process.exitCode = ExitCode.VerificationFailure;
}
