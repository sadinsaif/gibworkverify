import { describe, it, expect } from 'vitest';
import { canonicalize, computeRootHash, sortEvidence } from '../../src/evidence/manifest.js';
import type { ManifestContext } from '../../src/evidence/manifest.js';
import { sha256Hex, type EvidenceItem } from '../../src/evidence/hasher.js';

const context: ManifestContext = {
  schemaVersion: '1.0',
  bounty: { platform: 'gibwork', taskId: 'task-1' },
  repository: { commit: 'abc', branch: 'main' },
  verification: { passed: 2, failed: 0, warnings: 1 },
};

function item(id: string, data: string): EvidenceItem {
  return {
    id,
    type: 'file',
    title: id,
    path: `evidence/${id}.json`,
    sha256: sha256Hex(data),
    size: Buffer.byteLength(data),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('manifest canonicalization', () => {
  it('canonicalize sorts object keys recursively', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('sortEvidence orders by id ascending', () => {
    const sorted = sortEvidence([item('b', 'x'), item('a', 'y')]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('root hash is independent of input evidence order', () => {
    const h1 = computeRootHash(context, [item('a', '1'), item('b', '2')]).rootHash;
    const h2 = computeRootHash(context, [item('b', '2'), item('a', '1')]).rootHash;
    expect(h1).toBe(h2);
  });

  it('root hash changes when any evidence hash changes', () => {
    const base = computeRootHash(context, [item('a', '1')]).rootHash;
    const changed = computeRootHash(context, [item('a', '1-tampered')]).rootHash;
    expect(base).not.toBe(changed);
  });

  it('root hash changes when the context changes', () => {
    const base = computeRootHash(context, [item('a', '1')]).rootHash;
    const changed = computeRootHash(
      { ...context, verification: { passed: 1, failed: 1, warnings: 1 } },
      [item('a', '1')],
    ).rootHash;
    expect(base).not.toBe(changed);
  });

  it('is a 64-char lowercase hex digest', () => {
    expect(computeRootHash(context, [item('a', '1')]).rootHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
