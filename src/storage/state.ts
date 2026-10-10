import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CheckSpecSchema } from '../verification/engine.js';
import { CriterionSchema, ReadinessSchema } from '../analyzer/criterion-generator.js';
import { AmbiguityWarningSchema } from '../analyzer/ambiguity.js';
import { BountySnapshotSchema, type BountySnapshot } from '../gibwork/tasks.js';
import { invalidInput } from '../utils/errors.js';
import type { VerityPaths } from './paths.js';

/**
 * Persisted local state for a `.verity/` workspace: config, checklist, bounty
 * snapshot, and the submission intent record. All reads are schema-validated so
 * a hand-edited or corrupt file fails loudly instead of silently misbehaving.
 */

export const VerityConfigSchema = z.object({
  schemaVersion: z.literal('1.0'),
  platform: z.literal('gibwork'),
  taskId: z.string().nullable(),
  environment: z.string(),
  checks: z.array(CheckSpecSchema),
});
export type VerityConfig = z.infer<typeof VerityConfigSchema>;

export const ChecklistSchema = z.object({
  schemaVersion: z.literal('1.0'),
  taskId: z.string().nullable(),
  criteria: z.array(CriterionSchema),
  warnings: z.array(AmbiguityWarningSchema),
  readiness: ReadinessSchema,
  generatedAt: z.string(),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

/** Recovery record for a submission intent (contains NO secrets). */
export const SubmissionRecordSchema = z.object({
  schemaVersion: z.literal('1.0'),
  taskId: z.string(),
  intentId: z.string(),
  taskSubmissionId: z.string().nullable(),
  paymentAttemptId: z.string().nullable(),
  idempotencyKey: z.string(),
  status: z.string(),
  txHash: z.string().nullable(),
  environment: z.string(),
  walletAddress: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SubmissionRecord = z.infer<typeof SubmissionRecordSchema>;

// -------------------------------------------------------------------------
// Generic JSON IO
// -------------------------------------------------------------------------

export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

export function readJson<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw invalidInput(`Cannot read ${path.basename(file)} at ${file}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw invalidInput(`${path.basename(file)} is malformed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// -------------------------------------------------------------------------
// Workspace scaffolding + typed accessors
// -------------------------------------------------------------------------

export function workspaceExists(paths: VerityPaths): boolean {
  return fs.existsSync(paths.root);
}

export function ensureWorkspaceDirs(paths: VerityPaths): void {
  for (const dir of [paths.root, paths.evidenceDir, paths.reportsDir, paths.proofsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function defaultConfig(environment: string): VerityConfig {
  return { schemaVersion: '1.0', platform: 'gibwork', taskId: null, environment, checks: [] };
}

export function emptyChecklist(taskId: string | null, now: string): Checklist {
  return {
    schemaVersion: '1.0',
    taskId,
    criteria: [],
    warnings: [],
    readiness: { verifiable: 0, total: 0, score: 0 },
    generatedAt: now,
  };
}

export function loadConfig(paths: VerityPaths): VerityConfig {
  if (!fileExists(paths.config)) {
    throw invalidInput('No .verity workspace found here. Run `verity init` first.');
  }
  return readJson(paths.config, VerityConfigSchema);
}

export function loadConfigOrNull(paths: VerityPaths): VerityConfig | null {
  return fileExists(paths.config) ? readJson(paths.config, VerityConfigSchema) : null;
}

export function saveConfig(paths: VerityPaths, config: VerityConfig): void {
  writeJson(paths.config, config);
}

/** Bounty snapshot is stored as `null` until `bounty init` populates it. */
export function loadBountyOrNull(paths: VerityPaths): BountySnapshot | null {
  if (!fileExists(paths.bounty)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(paths.bounty, 'utf8'));
  } catch {
    throw invalidInput(`Cannot read bounty.json at ${paths.bounty}`);
  }
  if (raw === null) return null;
  const parsed = BountySnapshotSchema.safeParse(raw);
  if (!parsed.success) throw invalidInput(`bounty.json is malformed: ${parsed.error.message}`);
  return parsed.data;
}

export function saveBounty(paths: VerityPaths, bounty: BountySnapshot | null): void {
  writeJson(paths.bounty, bounty);
}

export function loadChecklistOrNull(paths: VerityPaths): Checklist | null {
  return fileExists(paths.checklist) ? readJson(paths.checklist, ChecklistSchema) : null;
}

export function saveChecklist(paths: VerityPaths, checklist: Checklist): void {
  writeJson(paths.checklist, checklist);
}

export function loadSubmissionOrNull(paths: VerityPaths): SubmissionRecord | null {
  return fileExists(paths.submission) ? readJson(paths.submission, SubmissionRecordSchema) : null;
}

export function saveSubmission(paths: VerityPaths, record: SubmissionRecord): void {
  writeJson(paths.submission, record);
}
