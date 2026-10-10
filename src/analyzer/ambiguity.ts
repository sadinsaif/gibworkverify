import { z } from 'zod';

/**
 * Ambiguity detection.
 *
 * Natural-language requirements routinely contain subjective, non-measurable
 * terms ("fast", "clean", "user-friendly"). Verity never pretends to verify
 * these automatically — it flags them so a human reviewer knows what still
 * needs judgment.
 */

export const AmbiguityWarningSchema = z.object({
  /** The vague term that triggered the warning. */
  term: z.string(),
  /** Human-readable explanation. */
  message: z.string(),
  /** The requirement text the term appeared in. */
  source: z.string(),
});
export type AmbiguityWarning = z.infer<typeof AmbiguityWarningSchema>;

/**
 * Vague, non-measurable terms. Each is matched as a whole word/phrase. The
 * list is intentionally conservative — only terms that are genuinely
 * unverifiable by a deterministic check.
 */
export const VAGUE_TERMS: readonly string[] = [
  'fast',
  'quick',
  'quickly',
  'performant',
  'high performance',
  'high-performance',
  'blazing',
  'blazingly fast',
  'scalable',
  'robust',
  'clean',
  'nice',
  'good',
  'great',
  'better',
  'best',
  'user-friendly',
  'user friendly',
  'intuitive',
  'modern',
  'beautiful',
  'elegant',
  'seamless',
  'lightweight',
  'optimal',
  'efficient',
  'reliable',
  'flexible',
  'simple',
  'easy',
  'production-grade',
  'enterprise-grade',
  'well-designed',
];

function wordRegex(term: string): RegExp {
  // Escape regex metacharacters, then bound by non-word edges.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i');
}

const COMPILED: { term: string; re: RegExp }[] = VAGUE_TERMS.map((term) => ({
  term,
  re: wordRegex(term),
}));

/** Return one warning per distinct vague term found in `source`. */
export function detectAmbiguity(source: string): AmbiguityWarning[] {
  const found = new Map<string, AmbiguityWarning>();
  for (const { term, re } of COMPILED) {
    if (re.test(source) && !found.has(term)) {
      found.set(term, {
        term,
        message: `"${term}" is subjective and cannot be verified automatically; a human reviewer must judge it.`,
        source: source.trim(),
      });
    }
  }
  return [...found.values()];
}

/** True if `source` contains at least one vague term. */
export function isAmbiguous(source: string): boolean {
  return COMPILED.some(({ re }) => re.test(source));
}
