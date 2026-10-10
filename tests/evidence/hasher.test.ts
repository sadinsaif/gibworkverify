import { describe, it, expect } from 'vitest';
import { sha256Hex, EvidenceItemSchema } from '../../src/evidence/hasher.js';

describe('hasher', () => {
  it('computes the known SHA-256 vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable across string and buffer inputs', () => {
    expect(sha256Hex(Buffer.from('abc', 'utf8'))).toBe(sha256Hex('abc'));
  });

  it('validates a well-formed evidence item', () => {
    const item = {
      id: 'a',
      type: 'file',
      title: 'A',
      path: 'evidence/a.json',
      sha256: sha256Hex('x'),
      size: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(EvidenceItemSchema.safeParse(item).success).toBe(true);
  });

  it('rejects a bad hash', () => {
    const bad = {
      id: 'a',
      type: 'file',
      title: 'A',
      path: 'evidence/a.json',
      sha256: 'not-a-hash',
      size: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(EvidenceItemSchema.safeParse(bad).success).toBe(false);
  });
});
