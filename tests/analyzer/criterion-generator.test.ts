import { describe, it, expect } from 'vitest';
import { analyzeBounty, generateCriteria } from '../../src/analyzer/criterion-generator.js';
import type { CriterionType } from '../../src/analyzer/criterion-generator.js';
import { parseRequirements } from '../../src/analyzer/requirement-parser.js';

function typeOf(desc: string): CriterionType {
  const { criteria } = generateCriteria(parseRequirements({ title: 'T', description: `- ${desc}` }));
  return criteria[0]!.type;
}

describe('criterion-generator', () => {
  it('classifies requirement types deterministically', () => {
    expect(typeOf('Automated tests must pass')).toBe('test');
    expect(typeOf('Commit your work with git')).toBe('git');
    expect(typeOf('Include a README.md file')).toBe('file');
    expect(typeOf('The project must build cleanly')).toBe('command');
    expect(typeOf('Document the design and explain the architecture')).toBe('manual');
  });

  it('demotes a purely-vague requirement to manual', () => {
    expect(typeOf('It should be fast')).toBe('manual');
  });

  it('never invents criteria for empty input', () => {
    const result = generateCriteria([]);
    expect(result.criteria).toHaveLength(0);
    expect(result.readiness.score).toBe(0);
  });

  it('computes a readiness score from verifiable, non-ambiguous criteria', () => {
    const result = analyzeBounty({
      title: 'T',
      description: '- Automated tests must pass\n- Include a README.md\n- It should be fast',
    });
    // 2 verifiable (test, file), 1 manual/ambiguous → 2/3.
    expect(result.readiness.total).toBe(3);
    expect(result.readiness.verifiable).toBe(2);
    expect(result.readiness.score).toBe(0.67);
  });

  it('generates unique, stable ids', () => {
    const result = analyzeBounty({ title: 'T', description: '- Add tests\n- Add tests please' });
    const ids = result.criteria.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records a detected command only as a suggestion, never executed', () => {
    const result = analyzeBounty({ title: 'T', description: '- Run `npm run lint` to check' });
    expect(result.criteria[0]?.suggestedCommand).toBe('npm run lint');
  });
});
