import { describe, it, expect } from 'vitest';
import { getTask, toBountySnapshot } from '../../src/gibwork/tasks.js';
import { analyzeBounty } from '../../src/analyzer/criterion-generator.js';
import { fakeGibworkRuntime, sampleBounty } from '../helpers.js';

describe('bounty inspect/init (mocked Gibwork client)', () => {
  it('fetches and normalizes a bounty snapshot', async () => {
    const rt = fakeGibworkRuntime({ getTask: () => sampleBounty() });
    const details = await getTask(rt.client, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    const snap = toBountySnapshot(details, 'production');

    expect(snap.title).toMatch(/greeting utility/i);
    expect(snap.reward?.symbol).toBe('USDC');
    expect(snap.reward?.priceUsd).toBe(50);
    expect(snap.description).not.toMatch(/<[a-z]/i); // HTML stripped to text
    expect(snap.url).toContain(snap.taskId);
    expect(snap.platform).toBe('gibwork');
  });

  it('analyzes the sample bounty into mixed criteria + warnings', () => {
    const snap = toBountySnapshot(sampleBounty(), 'production');
    const { criteria, warnings, readiness } = analyzeBounty({
      title: snap.title,
      description: snap.description,
    });
    const types = new Set(criteria.map((cr) => cr.type));
    expect(types.has('test')).toBe(true);
    expect(types.has('file')).toBe(true);
    expect(types.has('git')).toBe(true);
    expect(warnings.length).toBeGreaterThan(0); // "fast", "user-friendly"
    expect(readiness.verifiable).toBeGreaterThan(0);
    expect(readiness.total).toBeGreaterThanOrEqual(readiness.verifiable);
  });
});
