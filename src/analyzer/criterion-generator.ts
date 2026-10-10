import { z } from 'zod';
import { parseRequirements, type ParseInput, type RawRequirement } from './requirement-parser.js';
import { detectAmbiguity, isAmbiguous, type AmbiguityWarning } from './ambiguity.js';

/**
 * Criterion generator.
 *
 * Classifies each raw requirement into a deterministic acceptance-criterion
 * type. It is CONSERVATIVE and HONEST:
 *   - It never invents a requirement that wasn't in the bounty.
 *   - It never promotes a shell command found in untrusted bounty text into an
 *     executable step. A detected command is recorded as `suggestedCommand`
 *     (informational only); the verification engine executes ONLY commands the
 *     developer explicitly configures locally.
 *   - A requirement whose only signal is a vague term becomes `manual`.
 */

export const CriterionTypeSchema = z.enum([
  'command',
  'file',
  'git',
  'test',
  'manual',
  'informational',
]);
export type CriterionType = z.infer<typeof CriterionTypeSchema>;

export const CriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  type: CriterionTypeSchema,
  /** The raw requirement text this was derived from. */
  source: z.string(),
  /** A command detected in the text — a SUGGESTION only, never auto-executed. */
  suggestedCommand: z.string().optional(),
  /** For `file` criteria: the path/filename referenced. */
  path: z.string().optional(),
  /** Whether this criterion must pass before `verity submit` proceeds. */
  mandatory: z.boolean(),
  /** True if the requirement contains subjective/vague language. */
  ambiguous: z.boolean(),
  ambiguityReason: z.string().optional(),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const ReadinessSchema = z.object({
  verifiable: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** verifiable / total, rounded to 2 decimals (0 when there are no criteria). */
  score: z.number().min(0).max(1),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export interface AnalysisResult {
  criteria: Criterion[];
  warnings: AmbiguityWarning[];
  readiness: Readiness;
}

const TEST_RE =
  /\b(unit tests?|integration tests?|tests?\s+(?:must\s+)?pass|test suite|passing tests?|coverage|vitest|jest|mocha|pytest|npm test|yarn test)\b/i;
const BUILD_RE = /\b(build|compiles?|compile|builds?\s+(?:successfully|cleanly)|tsc|typecheck|type-check|lint|lints?)\b/i;
const GIT_RE = /\b(commit|commits|committed|pull request|pull-request|open a pr|\bPRs?\b|branch|pushed?|git history)\b/i;
const FILE_RE =
  /(\breadme\b|\blicense\b|\bchangelog\b|\bdockerfile\b|\.env\b|\bconfig(?:uration)? file\b|\ba file (?:called|named)\b|\bfile (?:called|named)\b|[\w./-]+\.(?:md|json|ts|js|tsx|jsx|yml|yaml|toml|txt|lock|sh))/i;
const COMMAND_RE = /\b(cli|command|runnable|executable|binary|\bscript\b|entrypoint)\b/i;
const MANUAL_RE =
  /\b(document|documentation|explain|describe|design|demo|video|screenshot|diagram|architecture|ui|ux|user experience|look and feel|style|aesthetic|review|readable|comment(?:ed|s)?)\b/i;

const BACKTICK_CMD = /`([^`]+)`/;
const COMMANDISH = /\b(npm|npx|yarn|pnpm|node|tsc|vitest|jest|git|cargo|python|pip|make|bash|sh)\b/;

/** Extract a command-looking token from the text, if present (SUGGESTION only). */
function detectCommand(text: string): string | undefined {
  const backtick = BACKTICK_CMD.exec(text);
  if (backtick && backtick[1] && COMMANDISH.test(backtick[1])) return backtick[1].trim();
  return undefined;
}

/** Extract a file path/name referenced in the text, if present. */
function detectPath(text: string): string | undefined {
  const pathLike = /[\w./-]+\.(?:md|json|ts|js|tsx|jsx|yml|yaml|toml|txt|lock|sh)\b/i.exec(text);
  if (pathLike) return pathLike[0];
  if (/\breadme\b/i.test(text)) return 'README.md';
  if (/\blicense\b/i.test(text)) return 'LICENSE';
  if (/\bchangelog\b/i.test(text)) return 'CHANGELOG.md';
  if (/\bdockerfile\b/i.test(text)) return 'Dockerfile';
  return undefined;
}

function classify(text: string): CriterionType {
  if (TEST_RE.test(text)) return 'test';
  if (GIT_RE.test(text)) return 'git';
  if (FILE_RE.test(text)) return 'file';
  if (BUILD_RE.test(text) || COMMAND_RE.test(text) || detectCommand(text)) return 'command';
  if (MANUAL_RE.test(text)) return 'manual';
  return 'informational';
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');
  return base || 'req';
}

const VERIFIABLE_TYPES = new Set<CriterionType>(['command', 'file', 'git', 'test']);

function makeCriterion(raw: RawRequirement, usedIds: Set<string>): Criterion {
  const type = classify(raw.text);
  const ambiguous = isAmbiguous(raw.text);
  // A requirement whose ONLY signal is vagueness is manual, not verifiable.
  const effectiveType: CriterionType =
    ambiguous && type === 'informational' ? 'manual' : type;

  // Stable, unique id.
  let id = slugify(raw.text);
  if (usedIds.has(id)) {
    let n = 2;
    while (usedIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  usedIds.add(id);

  const suggestedCommand = detectCommand(raw.text);
  const path = effectiveType === 'file' ? detectPath(raw.text) : undefined;
  const ambiguityReason = ambiguous
    ? detectAmbiguity(raw.text)
        .map((w) => w.term)
        .join(', ')
    : undefined;

  return {
    id,
    description: raw.text,
    type: effectiveType,
    source: raw.text,
    ...(suggestedCommand ? { suggestedCommand } : {}),
    ...(path ? { path } : {}),
    // Machine-verifiable, non-ambiguous criteria are mandatory by default.
    mandatory: VERIFIABLE_TYPES.has(effectiveType) && !ambiguous,
    ambiguous,
    ...(ambiguityReason ? { ambiguityReason } : {}),
  };
}

export function generateCriteria(requirements: RawRequirement[]): AnalysisResult {
  const usedIds = new Set<string>();
  const criteria = requirements.map((raw) => makeCriterion(raw, usedIds));

  const warnings: AmbiguityWarning[] = [];
  const seenWarnings = new Set<string>();
  for (const raw of requirements) {
    for (const w of detectAmbiguity(raw.text)) {
      const key = `${w.term}::${w.source}`;
      if (!seenWarnings.has(key)) {
        seenWarnings.add(key);
        warnings.push(w);
      }
    }
  }

  const total = criteria.length;
  const verifiable = criteria.filter((c) => VERIFIABLE_TYPES.has(c.type) && !c.ambiguous).length;
  const score = total === 0 ? 0 : Math.round((verifiable / total) * 100) / 100;

  return { criteria, warnings, readiness: { verifiable, total, score } };
}

/** Convenience: parse a bounty and generate its acceptance criteria in one call. */
export function analyzeBounty(input: ParseInput): AnalysisResult {
  return generateCriteria(parseRequirements(input));
}
