import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runChecks, summarize } from '../../src/verification/engine.js';
import type { CheckSpec, VerificationResult } from '../../src/verification/engine.js';
import { tempDir, cleanup } from '../helpers.js';

const allow = async () => true;

function result(status: VerificationResult['status'], mandatory = false): VerificationResult {
  return { id: status + String(mandatory), type: 'command', status, description: '', evidence: '', durationMs: 0, error: null, mandatory };
}

describe('engine summarize', () => {
  it('counts statuses and mandatory failures', () => {
    const s = summarize([
      result('PASS'),
      result('FAIL', true),
      result('FAIL', false),
      result('WARN'),
      result('SKIP'),
    ]);
    expect(s).toMatchObject({ passed: 1, failed: 2, warnings: 1, skipped: 1, total: 5, mandatoryFailed: 1 });
  });
});

describe('engine runChecks (file checks)', () => {
  let dir: string;
  afterEach(() => {
    if (dir) cleanup(dir);
  });

  it('PASSes an existing file and FAILs a missing one', async () => {
    dir = tempDir();
    writeFileSync(path.join(dir, 'present.txt'), 'hi');
    const specs: CheckSpec[] = [
      { id: 'present', type: 'file', description: 'present', path: 'present.txt', mandatory: true },
      { id: 'absent', type: 'file', description: 'absent', path: 'absent.txt', mandatory: true },
    ];
    const results = await runChecks(specs, { cwd: dir, authorize: allow });
    expect(results.find((r) => r.id === 'present')?.status).toBe('PASS');
    expect(results.find((r) => r.id === 'absent')?.status).toBe('FAIL');
  });

  it('honors the filterId', async () => {
    dir = tempDir();
    writeFileSync(path.join(dir, 'present.txt'), 'hi');
    const specs: CheckSpec[] = [
      { id: 'present', type: 'file', description: 'present', path: 'present.txt', mandatory: true },
      { id: 'absent', type: 'file', description: 'absent', path: 'absent.txt', mandatory: true },
    ];
    const results = await runChecks(specs, { cwd: dir, authorize: allow, filterId: 'present' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('present');
  });
});
