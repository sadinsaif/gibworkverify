import { describe, it, expect } from 'vitest';
import { detectAmbiguity, isAmbiguous } from '../../src/analyzer/ambiguity.js';

describe('ambiguity', () => {
  it('flags vague terms', () => {
    const warnings = detectAmbiguity('The CLI should be fast and user-friendly');
    const terms = warnings.map((w) => w.term);
    expect(terms).toContain('fast');
    expect(terms).toContain('user-friendly');
  });

  it('does not flag concrete requirements', () => {
    expect(isAmbiguous('Automated tests must pass')).toBe(false);
    expect(detectAmbiguity('Create a README.md file')).toHaveLength(0);
  });

  it('matches whole words only (no false positive inside another word)', () => {
    // "breakfast" contains "fast" but must not match.
    expect(isAmbiguous('Serve breakfast data')).toBe(false);
  });

  it('reports each distinct term once', () => {
    const warnings = detectAmbiguity('fast, fast, and fast again');
    expect(warnings).toHaveLength(1);
  });
});
