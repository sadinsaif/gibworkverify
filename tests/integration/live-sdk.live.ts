import { describe, it, expect } from 'vitest';
import { createGibworkRuntime } from '../../src/gibwork/client.js';
import { getTask, ping, toBountySnapshot } from '../../src/gibwork/tasks.js';

/**
 * OPT-IN live integration test. Hits the REAL Gibwork API (read-only) using an
 * auto-generated throwaway wallet. Never part of `npm test` or CI — run with
 * `npm run test:live`. Set GIBWORK_LIVE_TASK_ID to pin a specific bounty.
 */
describe('live Gibwork SDK (read-only)', () => {
  it('reaches discovery and reads a real task', async () => {
    const environment = process.env.GIBWORK_ENV === 'stage' ? 'stage' : 'production';
    const rt = createGibworkRuntime({ environment, timeoutMs: 20_000 });

    const probe = await ping(rt.client);
    expect(probe.reachable).toBe(true);

    let taskId: string | undefined = process.env.GIBWORK_LIVE_TASK_ID;
    if (!taskId) {
      const page = await rt.client.tasks.listAvailable({ page: 1, limit: 1 });
      taskId = page.results[0]?.id;
    }
    if (!taskId) return; // No open bounty to read right now — nothing to assert.

    const details = await getTask(rt.client, taskId);
    const snap = toBountySnapshot(details, environment);
    expect(snap.taskId).toBe(details.id);
    expect(typeof snap.title).toBe('string');
  }, 30_000);
});
