import { createGibworkRuntime, type GibworkRuntime, type Environment } from '../gibwork/client.js';
import { verityPaths, type VerityPaths } from '../storage/paths.js';
import { confirm } from '../utils/output.js';
import { invalidInput } from '../utils/errors.js';
import path from 'node:path';

/** Per-invocation runtime: resolved config, paths, and a lazy Gibwork client. */

export interface RuntimeConfig {
  cwd: string;
  environment: Environment;
  timeoutMs: number;
  json: boolean;
  assumeYes: boolean;
  fromFile?: string;
}

export interface Runtime {
  config: RuntimeConfig;
  version: string;
  json: boolean;
  paths: VerityPaths;
  /** Lazily build (and cache) the Gibwork runtime. */
  gibwork(opts?: { requireProvidedWallet?: boolean }): GibworkRuntime;
  /** Authorize a non-allowlisted command (interactive y/N or --yes). */
  authorizeCommand(command: string): Promise<boolean>;
}

export interface RuntimeFlags {
  cwd?: string;
  env?: string;
  timeout?: string;
  json?: boolean;
  yes?: boolean;
  fromFile?: string;
}

function parseEnvironment(value: string | undefined): Environment {
  const env = (value ?? process.env.GIBWORK_ENV ?? 'production').trim();
  if (env !== 'production' && env !== 'stage') {
    throw invalidInput(`Invalid environment "${env}". Use "production" or "stage".`);
  }
  return env;
}

function parseTimeout(value: string | undefined): number {
  const raw = value ?? process.env.VERITY_TIMEOUT_MS ?? '20000';
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw invalidInput(`Invalid timeout "${raw}".`);
  return n;
}

export function resolveRuntimeConfig(flags: RuntimeFlags): RuntimeConfig {
  return {
    cwd: path.resolve(flags.cwd ?? process.cwd()),
    environment: parseEnvironment(flags.env),
    timeoutMs: parseTimeout(flags.timeout),
    json: Boolean(flags.json),
    assumeYes: Boolean(flags.yes),
    ...(flags.fromFile ? { fromFile: flags.fromFile } : {}),
  };
}

export function createRuntime(config: RuntimeConfig, version: string): Runtime {
  let gw: GibworkRuntime | undefined;
  let gwProvided = false;

  return {
    config,
    version,
    json: config.json,
    paths: verityPaths(config.cwd),
    gibwork(opts): GibworkRuntime {
      const needProvided = Boolean(opts?.requireProvidedWallet);
      if (!gw || (needProvided && !gwProvided)) {
        gw = createGibworkRuntime({
          environment: config.environment,
          timeoutMs: config.timeoutMs,
          requireProvidedWallet: needProvided,
        });
        gwProvided = needProvided;
      }
      return gw;
    },
    authorizeCommand(command: string): Promise<boolean> {
      return confirm(`Run configured command: ${command}`, { assumeYes: config.assumeYes });
    },
  };
}
