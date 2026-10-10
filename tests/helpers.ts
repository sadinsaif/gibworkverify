import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  TaskDetails,
  TaskSubmissionIntent,
  TaskSubmissionIntentStatus,
  AvailableTaskPage,
  CreateSubmissionInput,
  SubmitSubmissionInput,
} from '@gibwork/sdk';
import type { GibworkRuntime, VerityGibworkClient } from '../src/gibwork/client.js';

/** Create and remove throwaway directories for filesystem tests. */
export function tempDir(prefix = 'verity-test-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}
export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** The committed sample bounty fixture, typed as SDK TaskDetails. */
export function sampleBounty(): TaskDetails {
  const file = path.join(here, '..', 'fixtures', 'sample-bounty.json');
  return JSON.parse(readFileSync(file, 'utf8')) as TaskDetails;
}

/** Build a minimal valid TaskSubmissionIntent for tests. */
export function makeIntent(overrides: Partial<TaskSubmissionIntent> = {}): TaskSubmissionIntent {
  return {
    intentId: 'intent-1',
    taskId: 'task-1',
    taskSubmissionId: 'submission-1',
    paymentAttemptId: 'pay-1',
    status: 'pending' as TaskSubmissionIntentStatus,
    txHash: null,
    expiresAt: '2026-01-01T00:00:00.000Z',
    lastValidBlockHeight: 100,
    fee: {
      amount: '0.15',
      amountBaseUnits: '150000',
      totalDebit: '0.15',
      symbol: 'USDC',
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      destinationAddress: 'Dest1111111111111111111111111111111111111111',
    },
    serializedTransaction: 'BASE64_TX',
    ...overrides,
  };
}

export interface FakeHandlers {
  getTask?: (id: string) => Promise<TaskDetails> | TaskDetails;
  listAvailable?: () => Promise<AvailableTaskPage> | AvailableTaskPage;
  prepareCreate?: (taskId: string, input: CreateSubmissionInput) => Promise<TaskSubmissionIntent>;
  submitCreate?: (
    taskId: string,
    intentId: string,
    input: SubmitSubmissionInput,
  ) => Promise<TaskSubmissionIntent>;
  getIntent?: (taskId: string, intentId: string) => Promise<TaskSubmissionIntent>;
}

/** A fully in-memory GibworkRuntime for integration tests (no network, no SDK client). */
export function fakeGibworkRuntime(h: FakeHandlers = {}): GibworkRuntime {
  const client: VerityGibworkClient = {
    tasks: {
      get: async (id: string) => {
        if (!h.getTask) throw new Error('getTask not mocked');
        return h.getTask(id);
      },
      listAvailable: async () => {
        if (!h.listAvailable) throw new Error('listAvailable not mocked');
        return h.listAvailable();
      },
    },
    submissions: {
      prepareCreate: async (taskId: string, input: CreateSubmissionInput) => {
        if (!h.prepareCreate) throw new Error('prepareCreate not mocked');
        return h.prepareCreate(taskId, input);
      },
      submitCreate: async (taskId: string, intentId: string, input: SubmitSubmissionInput) => {
        if (!h.submitCreate) throw new Error('submitCreate not mocked');
        return h.submitCreate(taskId, intentId, input);
      },
      getIntent: async (taskId: string, intentId: string) => {
        if (!h.getIntent) throw new Error('getIntent not mocked');
        return h.getIntent(taskId, intentId);
      },
    },
  };
  return {
    client,
    sign: async (serializedTransaction: string) => `signed:${serializedTransaction}`,
    wallet: { privateKey: '[1,2,3]', publicKey: 'FakePubKey11111111111111111111111111111111111', mode: 'env-private-key' },
    environment: 'stage',
  };
}
