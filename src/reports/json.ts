import type { BountySnapshot } from '../gibwork/tasks.js';
import type { Criterion, Readiness } from '../analyzer/criterion-generator.js';
import type { AmbiguityWarning } from '../analyzer/ambiguity.js';
import type { VerificationSummary } from '../verification/engine.js';
import type { GitInfo } from '../verification/git-check.js';

/**
 * The composed report model and its JSON rendering. One source of truth that
 * both the JSON and Markdown reports render from.
 */

export interface ReportModel {
  tool: { name: string; version: string };
  bounty: BountySnapshot | null;
  criteria: Criterion[];
  warnings: AmbiguityWarning[];
  readiness: Readiness | null;
  verification: VerificationSummary;
  git: GitInfo;
  evidenceCount: number;
  rootHash: string | null;
  proofCreatedAt: string | null;
  generatedAt: string;
}

export const DISCLAIMER =
  'Verity verdicts are deterministic checks and heuristic criteria intended to ' +
  'assist a human reviewer. A PASS means a configured check actually ran and ' +
  'succeeded; it is not a semantic guarantee that the bounty intent was met. ' +
  'The root hash is an integrity checksum, not a digital signature.';

/** Build the stable, serializable JSON report object. */
export function renderJsonReport(model: ReportModel): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    tool: model.tool,
    generatedAt: model.generatedAt,
    bounty: model.bounty,
    acceptanceCriteria: model.criteria,
    ambiguityWarnings: model.warnings,
    readiness: model.readiness,
    verification: {
      passed: model.verification.passed,
      failed: model.verification.failed,
      warnings: model.verification.warnings,
      skipped: model.verification.skipped,
      total: model.verification.total,
      mandatoryFailed: model.verification.mandatoryFailed,
      results: model.verification.results,
    },
    repository: {
      isRepo: model.git.isRepo,
      commit: model.git.commit,
      branch: model.git.branch,
      clean: model.git.clean,
      changedFiles: model.git.changedFiles,
      diffStat: model.git.diffStat,
      recentCommits: model.git.recentCommits,
      remote: model.git.remote,
    },
    evidence: { count: model.evidenceCount, rootHash: model.rootHash },
    proofCreatedAt: model.proofCreatedAt,
    disclaimer: DISCLAIMER,
  };
}
