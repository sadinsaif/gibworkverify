/**
 * Deterministic requirement parser.
 *
 * Turns a bounty's free-form title/description (plus the optional `requirements`
 * field some bounties carry) into a de-duplicated list of raw requirement
 * statements. It makes NO claim that every statement is machine-verifiable —
 * classification happens later in criterion-generator.ts.
 *
 * Strategy, in priority order:
 *   1. Explicit `requirements` field, split into lines/bullets.
 *   2. List items in the description (markdown/plain bullets, numbered, checkbox).
 *   3. Imperative requirement sentences ("must…", "implement…", "add…").
 *   4. Fallback to the title as a single requirement.
 */

export type RequirementOrigin = 'requirements' | 'list' | 'sentence' | 'title';

export interface RawRequirement {
  text: string;
  origin: RequirementOrigin;
}

const MAX_REQUIREMENTS = 40;
const MIN_LENGTH = 4;

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+(.+?)\s*$/;

const REQUIREMENT_VERB =
  /\b(must|should|shall|needs? to|has to|implement|create|add|build|support|provide|ensure|include|expose|generate|use|handle|return|validate|document|write|accept|parse|output|produce|store|hash|verify|submit)\b/i;

/** Collapse whitespace and strip any residual HTML tags. */
function normalize(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n');
}

function cleanStatement(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s*_>#-]+/, '')
    .replace(/[\s.;,:]+$/, '')
    .trim();
}

function extractListItems(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split('\n')) {
    const m = LIST_ITEM.exec(line);
    if (m && m[1]) items.push(cleanStatement(m[1]));
  }
  return items;
}

function extractSentences(text: string): string[] {
  const flattened = text.replace(/\n+/g, ' ');
  const parts = flattened.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const part of parts) {
    const cleaned = cleanStatement(part);
    if (cleaned.length >= MIN_LENGTH && REQUIREMENT_VERB.test(cleaned)) {
      out.push(cleaned);
    }
  }
  return out;
}

function pushUnique(acc: RawRequirement[], seen: Set<string>, text: string, origin: RequirementOrigin): void {
  const cleaned = cleanStatement(text);
  if (cleaned.length < MIN_LENGTH) return;
  const key = cleaned.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  acc.push({ text: cleaned, origin });
}

export interface ParseInput {
  title: string;
  description: string;
  requirements?: string | null;
}

export function parseRequirements(input: ParseInput): RawRequirement[] {
  const acc: RawRequirement[] = [];
  const seen = new Set<string>();

  const requirementsField = input.requirements ? normalize(input.requirements) : '';
  if (requirementsField.trim()) {
    const listed = extractListItems(requirementsField);
    const source = listed.length > 0 ? listed : requirementsField.split('\n');
    for (const item of source) pushUnique(acc, seen, item, 'requirements');
  }

  const description = normalize(input.description ?? '');
  for (const item of extractListItems(description)) {
    pushUnique(acc, seen, item, 'list');
  }

  // Only fall back to sentence extraction if we have few explicit items.
  if (acc.length < 2) {
    for (const sentence of extractSentences(description)) {
      pushUnique(acc, seen, sentence, 'sentence');
    }
  }

  // Last resort: the title itself is the requirement.
  if (acc.length === 0 && input.title.trim()) {
    pushUnique(acc, seen, input.title, 'title');
  }

  return acc.slice(0, MAX_REQUIREMENTS);
}
