import { createGibworkClient, createKeypairSigner } from '@gibwork/sdk/node';
import {
  signPreparedTransaction,
  type TaskDetails,
  type AvailableTaskPage,
  type AvailableTasksQuery,
  type TaskSubmissionIntent,
  type CreateSubmissionInput,
  type SubmitSubmissionInput,
  type RequestOptions,
} from '@gibwork/sdk';
import { resolveWallet, type ResolvedWallet } from './wallet.js';

/**
 * The NARROW slice of the official Gibwork client that Verity depends on.
 * Declaring it as an interface (a) documents the exact surface we use and
 * (b) lets tests inject a fake with zero network and no real SDK.
 *
 * The method shapes reuse the SDK's own types so the real client is assignable
 * to this interface without casts.
 */
export interface VerityGibworkClient {
  tasks: {
    get(taskId: string, options?: RequestOptions): Promise<TaskDetails>;
    listAvailable(query?: AvailableTasksQuery, options?: RequestOptions): Promise<AvailableTaskPage>;
  };
  submissions: {
    prepareCreate(
      taskId: string,
      input: CreateSubmissionInput,
      options?: RequestOptions,
    ): Promise<TaskSubmissionIntent>;
    submitCreate(
      taskId: string,
      intentId: string,
      input: SubmitSubmissionInput,
      options?: RequestOptions,
    ): Promise<TaskSubmissionIntent>;
    getIntent(taskId: string, intentId: string, options?: RequestOptions): Promise<TaskSubmissionIntent>;
  };
}

export type Environment = 'production' | 'stage';

/** Everything a command needs to talk to Gibwork — client, signer, wallet. */
export interface GibworkRuntime {
  client: VerityGibworkClient;
  /** Sign a prepared serialized transaction with the resolved wallet. */
  sign(serializedTransaction: string): Promise<string>;
  wallet: ResolvedWallet;
  environment: Environment;
}

export interface GibworkRuntimeOptions {
  environment: Environment;
  timeoutMs: number;
  /** Require a user-provided (non-ephemeral) wallet — used by `submit`. */
  requireProvidedWallet?: boolean;
}

/** Build a real, wallet-authenticated Gibwork runtime from the environment. */
export function createGibworkRuntime(opts: GibworkRuntimeOptions): GibworkRuntime {
  const wallet = resolveWallet({ requireProvided: opts.requireProvidedWallet });
  const client = createGibworkClient({
    privateKey: wallet.privateKey,
    production: opts.environment === 'production',
    timeoutMs: opts.timeoutMs,
  });
  const signer = createKeypairSigner(wallet.privateKey);
  return {
    client,
    sign: (serializedTransaction: string) => signPreparedTransaction(serializedTransaction, signer),
    wallet,
    environment: opts.environment,
  };
}
