import { z } from 'zod';
import { commandCheck } from './command-check.js';
import { fileCheck } from './file-check.js';
import { gitCheck } from './git-check.js';

/**
 * The deterministic verification engine.
 *
 * It runs a list of locally-configured CheckSpecs and maps each to a result
 * with a PASS / FAIL / WARN / SKIP status. A PASS is only ever produced when a
 * check actually executed and met its condition — the engine never assumes
 * success for a check it did not run.
 */

export const CheckStatusSchema = z.enum(['PASS', 'FAIL', 'WARN', 'SKIP']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/** What an individual check function returns (before the mandatory flag). */
export const CheckOutcomeSchema = z.object({
  id: z.string().min(1),
  /** command | file | git | test | manual | informational */
  type: z.string(),
  status: CheckStatusSchema,
  description: z.string(),
  /** Short, human-readable evidence summary (always present). */
  evidence: z.string(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().nullable(),
  /** Optional richer captured data (sanitized before it is persisted). */
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type CheckOutcome = z.infer<typeof CheckOutcomeSchema>;

export const VerificationResultSchema = CheckOutcomeSchema.extend({
  /** Whether a failure here blocks `verity submit`. */
  mandatory: z.boolean(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const CheckKindSchema = z.enum(['command', 'file', 'git', 'test']);
export type CheckKind = z.infer<typeof CheckKindSchema>;

/** A locally-configured, executable check (lives in .verity/config.json). */
export const CheckSpecSchema = z.object({
  id: z.string().min(1),
  type: CheckKindSchema,
  description: z.string(),
  command: z.string().optional(),
  path: z.string().optional(),
  git: z
    .object({ requireClean: z.boolean().optional(), requireCommits: z.boolean().optional() })
    .optional(),
  mandatory: z.boolean(),
});
export type CheckSpec = z.infer<typeof CheckSpecSchema>;

export interface RunChecksContext {
  cwd: string;
  /** Authorize a non-allowlisted command (interactive prompt / --yes). */
  authorize: (command: string) => Promise<boolean>;
  timeoutMs?: number;
  /** If set, run only the check with this id. */
  filterId?: string;
}

async function runOne(spec: CheckSpec, ctx: RunChecksContext): Promise<VerificationResult> {
  let outcome: CheckOutcome;
  switch (spec.type) {
    case 'file':
      outcome = await fileCheck({ id: spec.id, description: spec.description, path: spec.path }, ctx.cwd);
      break;
    case 'git':
      outcome = await gitCheck({ id: spec.id, description: spec.description, git: spec.git }, ctx.cwd);
      break;
    case 'command':
    case 'test':
      outcome = await commandCheck(
        { id: spec.id, type: spec.type, description: spec.description, command: spec.command },
        { cwd: ctx.cwd, authorize: ctx.authorize, timeoutMs: ctx.timeoutMs },
      );
      break;
  }
  return { ...outcome, mandatory: spec.mandatory };
}

/** Run all (or one filtered) configured checks, sequentially and deterministically. */
export async function runChecks(
  specs: CheckSpec[],
  ctx: RunChecksContext,
): Promise<VerificationResult[]> {
  const selected = ctx.filterId ? specs.filter((s) => s.id === ctx.filterId) : specs;
  const results: VerificationResult[] = [];
  for (const spec of selected) {
    results.push(await runOne(spec, ctx));
  }
  return results;
}

export interface VerificationSummary {
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  total: number;
  /** Count of mandatory checks that failed (blocks submit). */
  mandatoryFailed: number;
  results: VerificationResult[];
}

export function summarize(results: VerificationResult[]): VerificationSummary {
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let skipped = 0;
  let mandatoryFailed = 0;
  for (const r of results) {
    if (r.status === 'PASS') passed += 1;
    else if (r.status === 'FAIL') {
      failed += 1;
      if (r.mandatory) mandatoryFailed += 1;
    } else if (r.status === 'WARN') warnings += 1;
    else skipped += 1;
  }
  return { passed, failed, warnings, skipped, total: results.length, mandatoryFailed, results };
}
