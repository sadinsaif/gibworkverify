import { describe, it, expect } from 'vitest';
import { parseRequirements } from '../../src/analyzer/requirement-parser.js';

describe('requirement-parser', () => {
  it('extracts markdown/plain list items', () => {
    const reqs = parseRequirements({
      title: 'Build a thing',
      description: 'Intro.\n- Implement a CLI\n- Add tests\n* Write a README',
    });
    const texts = reqs.map((r) => r.text);
    expect(texts).toContain('Implement a CLI');
    expect(texts).toContain('Add tests');
    expect(texts).toContain('Write a README');
    expect(reqs.every((r) => r.origin === 'list')).toBe(true);
  });

  it('falls back to imperative sentences when there are no lists', () => {
    const reqs = parseRequirements({
      title: 'T',
      description: 'You must implement a parser. It should return JSON. Thanks for reading.',
    });
    const texts = reqs.map((r) => r.text.toLowerCase());
    expect(texts.some((t) => t.includes('implement a parser'))).toBe(true);
    expect(texts.some((t) => t.includes('return json'))).toBe(true);
    // Non-requirement sentence is dropped.
    expect(texts.some((t) => t.includes('thanks for reading'))).toBe(false);
  });

  it('falls back to the title when nothing else is found', () => {
    const reqs = parseRequirements({ title: 'Just a title', description: 'nothing actionable here' });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.origin).toBe('title');
  });

  it('prefers the explicit requirements field and de-duplicates', () => {
    const reqs = parseRequirements({
      title: 'T',
      description: '- Implement a CLI',
      requirements: '- Implement a CLI\n- Ship docs',
    });
    const texts = reqs.map((r) => r.text);
    expect(texts.filter((t) => t === 'Implement a CLI')).toHaveLength(1);
    expect(texts).toContain('Ship docs');
  });

  it('strips residual HTML tags', () => {
    const reqs = parseRequirements({ title: 'T', description: '<ul><li>Implement <code>x</code></li></ul>' });
    expect(reqs[0]?.text).toBe('Implement x');
  });
});
