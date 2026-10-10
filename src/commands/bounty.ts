import fs from 'node:fs';
import type { TaskDetails } from '@gibwork/sdk';
import {
  getTask,
  toBountySnapshot,
  taskIdFromInput,
  type BountySnapshot,
} from '../gibwork/tasks.js';
import { analyzeBounty, type Criterion } from '../analyzer/criterion-generator.js';
import { detectTestCommand, detectBuildCommand } from '../verification/test-check.js';
import type { CheckSpec } from '../verification/engine.js';
import { redactValue } from '../evidence/sanitizer.js';
import {
  ensureWorkspaceDirs,
  saveBounty,
  saveChecklist,
  saveConfig,
  loadConfigOrNull,
  defaultConfig,
  type Checklist,
} from '../storage/state.js';
import { invalidInput } from '../utils/errors.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

/** Read the optional free-form `requirements` field if a task carries one. */
function readRequirements(details: TaskDetails): string | null {
  const extra = details as unknown as Record<string, unknown>;
  return typeof extra.requirements === 'string' ? extra.requirements : null;
}

function loadTaskDetailsFromFile(file: string): TaskDetails {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw invalidInput(`Cannot read task file: ${file}`);
  }
  if (!raw || typeof raw !== 'object') throw invalidInput('Task file must be a JSON object.');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.title !== 'string' || typeof obj.content !== 'string') {
    throw invalidInput('Task file must include string fields: id, title, content.');
  }
  return raw as TaskDetails;
}

/** Fetch task details from Gibwork, or from a local file when --from-file is set. */
async function loadTaskDetails(rt: Runtime, taskIdArg?: string): Promise<TaskDetails> {
  if (rt.config.fromFile) return loadTaskDetailsFromFile(rt.config.fromFile);
  if (!taskIdArg) throw invalidInput('A task id or URL is required (or pass --from-file <path>).');
  const id = taskIdFromInput(taskIdArg);
  return getTask(rt.gibwork().client, id);
}

/** Seed executable check specs from the generated, verifiable criteria. */
export function deriveChecks(criteria: Criterion[], cwd: string): CheckSpec[] {
  const testCmd = detectTestCommand(cwd);
  const buildCmd = detectBuildCommand(cwd);
  const buildHint = /\b(build|compile|compiles|tsc|typecheck|type-check|lint)\b/i;
  const checks: CheckSpec[] = [];
  for (const cr of criteria) {
    if (cr.type === 'test') {
      checks.push({
        id: cr.id,
        type: 'test',
        description: cr.description,
        command: cr.suggestedCommand ?? testCmd ?? 'npm test',
        mandatory: cr.mandatory,
      });
    } else if (cr.type === 'command') {
      // Only a build-ish command criterion inherits the detected build command;
      // a generic "a CLI exists" criterion is left unconfigured (SKIP) for the
      // developer to fill in — never guessed.
      const command = cr.suggestedCommand ?? (buildHint.test(cr.description) ? buildCmd ?? '' : '');
      checks.push({ id: cr.id, type: 'command', description: cr.description, command, mandatory: cr.mandatory });
    } else if (cr.type === 'file') {
      checks.push({
        id: cr.id,
        type: 'file',
        description: cr.description,
        path: cr.path ?? '',
        mandatory: cr.mandatory,
      });
    } else if (cr.type === 'git') {
      checks.push({
        id: cr.id,
        type: 'git',
        description: cr.description,
        git: { requireCommits: true },
        mandatory: cr.mandatory,
      });
    }
    // manual / informational criteria have no executable check.
  }
  return checks;
}

function rewardText(bounty: BountySnapshot): string {
  if (!bounty.reward) return 'n/a';
  const usd = bounty.reward.priceUsd != null ? ` (~$${bounty.reward.priceUsd})` : '';
  return `${bounty.reward.amount} ${bounty.reward.symbol}${usd}`;
}

function printCriteria(criteria: Criterion[]): void {
  if (criteria.length === 0) {
    info(c.dim('  (no acceptance criteria generated)'));
    return;
  }
  for (const cr of criteria) {
    const flags = `${cr.mandatory ? '' : c.dim(' optional')}${cr.ambiguous ? c.yellow(' ambiguous') : ''}`;
    info(`  ${c.cyan(cr.type.padEnd(13))} ${cr.description}${flags}`);
  }
}

function printWarnings(warnings: { term: string; message: string }[]): void {
  if (warnings.length === 0) return;
  info('');
  info(c.yellow(`WARNING: ${warnings.length} requirement(s) cannot be verified automatically:`));
  for (const w of warnings) info(c.yellow(`  • ${w.message}`));
}

// -------------------------------------------------------------------------

export async function bountyInspectCmd(taskIdArg: string | undefined, rt: Runtime): Promise<void> {
  const details = await loadTaskDetails(rt, taskIdArg);
  const bounty = toBountySnapshot(details, rt.config.environment);
  const analysis = analyzeBounty({
    title: bounty.title,
    description: bounty.description,
    requirements: readRequirements(details),
  });

  if (rt.json) {
    emitJson({
      bounty,
      criteria: analysis.criteria,
      warnings: analysis.warnings,
      readiness: analysis.readiness,
    });
    return;
  }

  info(section(bounty.title));
  info(kv('task', bounty.taskId));
  info(kv('reward', rewardText(bounty)));
  info(kv('status', `${bounty.status}${bounty.isOpen ? ' (open)' : ''}`));
  info(kv('tags', bounty.tags.length ? bounty.tags.join(', ') : c.dim('none')));
  info(kv('readiness', `${analysis.readiness.verifiable}/${analysis.readiness.total} verifiable (score ${analysis.readiness.score})`));
  info(kv('url', bounty.url));
  info('');
  info(section('Description'));
  info(bounty.description ? bounty.description : c.dim('(empty)'));
  info('');
  info(section(`Acceptance criteria (${analysis.criteria.length})`));
  printCriteria(analysis.criteria);
  printWarnings(analysis.warnings);
}

export async function bountyInitCmd(taskIdArg: string | undefined, rt: Runtime): Promise<void> {
  ensureWorkspaceDirs(rt.paths);
  const details = await loadTaskDetails(rt, taskIdArg);
  const bounty = toBountySnapshot(details, rt.config.environment);
  const safeBounty = redactValue(bounty);
  const analysis = analyzeBounty({
    title: bounty.title,
    description: bounty.description,
    requirements: readRequirements(details),
  });
  const checks = deriveChecks(analysis.criteria, rt.config.cwd);
  const now = new Date().toISOString();

  // Persist sanitized snapshot, checklist, and seeded verification config.
  saveBounty(rt.paths, safeBounty);
  const checklist: Checklist = {
    schemaVersion: '1.0',
    taskId: bounty.taskId,
    criteria: analysis.criteria,
    warnings: analysis.warnings,
    readiness: analysis.readiness,
    generatedAt: now,
  };
  saveChecklist(rt.paths, checklist);
  const config = loadConfigOrNull(rt.paths) ?? defaultConfig(rt.config.environment);
  config.taskId = bounty.taskId;
  config.checks = checks;
  saveConfig(rt.paths, config);

  if (rt.json) {
    emitJson({
      bounty: safeBounty,
      criteriaCount: analysis.criteria.length,
      checks: checks.length,
      readiness: analysis.readiness,
      warnings: analysis.warnings,
    });
    return;
  }

  info(section('verity bounty init'));
  info(kv('task', bounty.taskId));
  info(kv('title', bounty.title));
  info(kv('criteria', `${analysis.criteria.length} generated`));
  info(kv('checks', `${checks.length} executable check(s) seeded in config.json`));
  info(kv('readiness', `${analysis.readiness.verifiable}/${analysis.readiness.total} (score ${analysis.readiness.score})`));
  info('');
  printCriteria(analysis.criteria);
  printWarnings(analysis.warnings);
  info('');
  info(c.dim('  Review .verity/config.json, then run `verity verify`.'));
}

export async function bountyStatusCmd(taskIdArg: string | undefined, rt: Runtime): Promise<void> {
  const details = await loadTaskDetails(rt, taskIdArg);
  const bounty = toBountySnapshot(details, rt.config.environment);

  if (rt.json) {
    emitJson({
      taskId: bounty.taskId,
      title: bounty.title,
      status: bounty.status,
      isOpen: bounty.isOpen,
      deadline: bounty.deadline,
      submissionCounts: bounty.submissionCounts,
    });
    return;
  }

  info(section(bounty.title));
  info(kv('task', bounty.taskId));
  info(kv('status', `${bounty.status}${bounty.isOpen ? ' (open)' : ' (closed)'}`));
  info(kv('deadline', bounty.deadline ?? c.dim('none')));
  info(
    kv(
      'submissions',
      `${bounty.submissionCounts.pending} pending · ${bounty.submissionCounts.approved} approved · ${bounty.submissionCounts.rejected} rejected`,
    ),
  );
}
