/**
 * Secret redaction, applied to ALL evidence (and the stored bounty snapshot)
 * BEFORE anything is written to disk, hashed, reported, or logged.
 *
 * Two layers:
 *   1. Pattern redaction for well-known secret shapes (keys, tokens, headers).
 *   2. Literal redaction of the VALUES of any secret-looking environment
 *      variable currently set, so a key that leaks into command output or a
 *      stack trace is scrubbed even if its shape isn't recognized.
 *
 * This is defense-in-depth, not a guarantee. The primary protection is that
 * Verity never deliberately captures secret material in the first place.
 */

export const REDACTED = '[REDACTED]';

const PATTERNS: { re: RegExp; replace: string }[] = [
  // PEM private key blocks.
  {
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: '[REDACTED PRIVATE KEY]',
  },
  // JSON Web Tokens.
  { re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replace: '[REDACTED JWT]' },
  // AWS access key id.
  { re: /AKIA[0-9A-Z]{16}/g, replace: '[REDACTED AWS KEY]' },
  // Authorization header (keeps the header name, drops the value).
  { re: /(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, replace: '$1[REDACTED]' },
  // Bare bearer tokens.
  { re: /bearer\s+[A-Za-z0-9._-]{8,}/gi, replace: 'Bearer [REDACTED]' },
  // Solana secret key as a JSON byte array (32+ numbers; real ones are 64).
  { re: /\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/g, replace: '[REDACTED KEYPAIR]' },
  // Long base58 blobs (secret keys / signatures are 80+ base58 chars).
  { re: /\b[1-9A-HJ-NP-Za-km-z]{80,}\b/g, replace: '[REDACTED BASE58]' },
  // URL embedded credentials (e.g. https://user:token@host).
  { re: /(\w+:\/\/)[^/@\s:]+:[^/@\s]+@/g, replace: '$1[REDACTED]@' },
  // key = value / key: value secret assignments (keeps the key and separator).
  {
    re: /\b([A-Za-z0-9_]*(?:PRIVATE_KEY|SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|MNEMONIC|SEED_PHRASE)[A-Za-z0-9_]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
    replace: '$1$2[REDACTED]',
  },
];

const SECRET_ENV_NAME =
  /(PRIVATE_KEY|SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|MNEMONIC|SEED)/i;

/** Values of currently-set secret-looking env vars (length-gated to avoid noise). */
function secretEnvValues(): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (SECRET_ENV_NAME.test(name)) values.push(value);
  }
  return values;
}

/** Redact secrets from a single string. */
export function redact(input: string): string {
  let out = input;
  // Literal env-value redaction first (no regex escaping needed via split/join).
  for (const value of secretEnvValues()) {
    if (out.includes(value)) out = out.split(value).join(REDACTED);
  }
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

/** Deep-redact every string leaf in a JSON-serializable value (returns a clone). */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactValue(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out as unknown as T;
  }
  return value;
}
