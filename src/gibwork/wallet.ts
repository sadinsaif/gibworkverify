import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Keypair } from '@solana/web3.js';
import { ephemeralKeyPath, appHome } from '../storage/paths.js';
import { configError } from '../utils/errors.js';

const require = createRequire(import.meta.url);

export type WalletMode = 'env-private-key' | 'env-keypair-file' | 'ephemeral-read-only';

export interface ResolvedWallet {
  /** Secret key as a JSON array string of bytes — a form the SDK accepts. */
  privateKey: string;
  publicKey: string;
  mode: WalletMode;
  /** For file/ephemeral modes, where the key came from. */
  source?: string;
}

/**
 * Resolve a Solana wallet for the Gibwork SDK.
 *
 * The Gibwork API is wallet-authenticated even for READS, so a key is always
 * needed to sign auth messages. For read/verify flows the wallet needs no
 * funds. For `verity submit` (a real paid submission) the caller must provide
 * a funded, eligible wallet via env — see `requireProvided`.
 *
 * Resolution order:
 *   1. GIBWORK_PRIVATE_KEY  — base58, or a JSON array of 32/64 bytes.
 *   2. GIBWORK_KEYPAIR_PATH — a Solana keypair JSON file.
 *   3. Auto-generated ephemeral READ-ONLY key, persisted 0600 under app home.
 */
export function resolveWallet(opts: { requireProvided?: boolean } = {}): ResolvedWallet {
  const rawKey = process.env.GIBWORK_PRIVATE_KEY?.trim();
  if (rawKey) {
    const kp = keypairFromString(rawKey);
    return { privateKey: toJsonSecret(kp), publicKey: kp.publicKey.toBase58(), mode: 'env-private-key' };
  }

  const keyPath = process.env.GIBWORK_KEYPAIR_PATH?.trim();
  if (keyPath) {
    const kp = keypairFromFile(keyPath);
    return {
      privateKey: toJsonSecret(kp),
      publicKey: kp.publicKey.toBase58(),
      mode: 'env-keypair-file',
      source: keyPath,
    };
  }

  if (opts.requireProvided) {
    throw configError(
      'A funded, eligible wallet is required for this action. Set GIBWORK_PRIVATE_KEY ' +
        'or GIBWORK_KEYPAIR_PATH — the auto-generated read-only key cannot pay a submission fee.',
    );
  }

  return loadOrCreateEphemeral();
}

function toJsonSecret(kp: Keypair): string {
  return JSON.stringify(Array.from(kp.secretKey));
}

function loadOrCreateEphemeral(): ResolvedWallet {
  const file = ephemeralKeyPath();
  if (fs.existsSync(file)) {
    try {
      const kp = keypairFromFile(file);
      return {
        privateKey: toJsonSecret(kp),
        publicKey: kp.publicKey.toBase58(),
        mode: 'ephemeral-read-only',
        source: file,
      };
    } catch {
      // Corrupt — regenerate below.
    }
  }

  fs.mkdirSync(appHome(), { recursive: true });
  const kp = Keypair.generate();
  const bytes = toJsonSecret(kp);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, bytes, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is best-effort on some Windows setups.
  }
  return { privateKey: bytes, publicKey: kp.publicKey.toBase58(), mode: 'ephemeral-read-only', source: file };
}

function keypairFromFile(filePath: string): Keypair {
  if (!fs.existsSync(filePath)) {
    throw configError(`Keypair file not found: ${filePath}`);
  }
  return keypairFromString(fs.readFileSync(filePath, 'utf8').trim());
}

/** Accept a JSON byte array (32 or 64 bytes) or a base58 secret key string. */
function keypairFromString(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    let arr: unknown;
    try {
      arr = JSON.parse(trimmed);
    } catch {
      throw configError('Wallet key is not valid JSON.');
    }
    if (!Array.isArray(arr) || (arr.length !== 64 && arr.length !== 32)) {
      throw configError('Wallet key JSON array must contain 32 or 64 byte values.');
    }
    const bytes = Uint8Array.from(arr as number[]);
    return arr.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
  }
  return keypairFromBase58(trimmed);
}

function keypairFromBase58(b58: string): Keypair {
  // bs58 is a transitive dependency of @gibwork/sdk.
  const bs58 = require('bs58') as {
    default?: { decode(s: string): Uint8Array };
    decode?(s: string): Uint8Array;
  };
  const decode = bs58.decode ?? bs58.default?.decode;
  if (!decode) throw configError('Unable to load bs58 decoder.');
  let bytes: Uint8Array;
  try {
    bytes = decode(b58);
  } catch {
    throw configError('Wallet key is not valid base58.');
  }
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw configError('base58 secret key must decode to 32 or 64 bytes.');
}
