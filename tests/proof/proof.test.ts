import { describe, it, expect, afterEach } from 'vitest';
import { appendFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { verityPaths } from '../../src/storage/paths.js';
import { ensureWorkspaceDirs } from '../../src/storage/state.js';
import { collectEvidence } from '../../src/evidence/collector.js';
import { emptyGitInfo } from '../../src/verification/git-check.js';
import type { VerificationResult } from '../../src/verification/engine.js';
import type { ManifestContext } from '../../src/evidence/manifest.js';
import { buildProof, writeProof } from '../../src/proof/receipt.js';
import { verifyProofFile } from '../../src/proof/integrity.js';
import { tempDir, cleanup } from '../helpers.js';

const NOW = '2026-01-01T00:00:00.000Z';
const context: ManifestContext = {
  schemaVersion: '1.0',
  bounty: { platform: 'gibwork', taskId: 't' },
  repository: { commit: null, branch: null },
  verification: { passed: 2, failed: 0, warnings: 0 },
};

function results(): VerificationResult[] {
  return [
    { id: 'tests', type: 'test', status: 'PASS', description: 'tests', evidence: 'ok', durationMs: 5, error: null, mandatory: true },
    { id: 'readme', type: 'file', status: 'PASS', description: 'readme', evidence: 'ok', durationMs: 0, error: null, mandatory: true },
  ];
}

function makeProof(dir: string) {
  const paths = verityPaths(dir);
  ensureWorkspaceDirs(paths);
  const { manifest } = collectEvidence({ paths, results: results(), git: emptyGitInfo(), context, now: NOW });
  const proof = buildProof({ version: '0.1.0', manifest, createdAt: NOW });
  writeProof(paths.proof, proof);
  return paths;
}

describe('proof lifecycle + tamper detection', () => {
  let dir = '';
  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('creates a valid proof and verifies it', () => {
    dir = tempDir();
    const paths = makeProof(dir);
    const v = verifyProofFile(paths.proof);
    expect(v.valid).toBe(true);
    expect(v.expectedRootHash).toBe(v.actualRootHash);
    expect(v.changed).toHaveLength(0);
    expect(v.missing).toHaveLength(0);
  });

  it('detects a tampered evidence file', () => {
    dir = tempDir();
    const paths = makeProof(dir);
    appendFileSync(path.join(paths.evidenceDir, 'verification-summary.json'), '\n');
    const v = verifyProofFile(paths.proof);
    expect(v.valid).toBe(false);
    expect(v.expectedRootHash).not.toBe(v.actualRootHash);
    expect(v.changed).toContain('verification-summary');
  });

  it('detects a missing evidence file', () => {
    dir = tempDir();
    const paths = makeProof(dir);
    rmSync(path.join(paths.evidenceDir, 'git-state.json'));
    const v = verifyProofFile(paths.proof);
    expect(v.valid).toBe(false);
    expect(v.missing).toContain('git-state');
  });

  it('rejects a malformed proof file', () => {
    dir = tempDir();
    const proofsDir = path.join(dir, 'proofs');
    mkdirSync(proofsDir, { recursive: true });
    const bad = path.join(proofsDir, 'proof.json');
    writeFileSync(bad, '{ not valid json');
    expect(() => verifyProofFile(bad)).toThrow();
  });
});
