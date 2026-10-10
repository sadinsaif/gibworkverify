import { describe, it, expect, afterEach } from 'vitest';
import { redact, redactValue, REDACTED } from '../../src/evidence/sanitizer.js';

const envKeys: string[] = [];
afterEach(() => {
  for (const k of envKeys) delete process.env[k];
  envKeys.length = 0;
});

describe('sanitizer', () => {
  it('redacts a Solana secret-key byte array', () => {
    const arr = `[${Array.from({ length: 64 }, (_, i) => i).join(',')}]`;
    const out = redact(`key=${arr}`);
    expect(out).toContain('[REDACTED KEYPAIR]');
    expect(out).not.toContain('63');
  });

  it('redacts an Authorization header value but keeps the name', () => {
    const out = redact('Authorization: Bearer abcdef123456');
    expect(out).toMatch(/Authorization:/i);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain('abcdef123456');
  });

  it('redacts long base58 blobs', () => {
    const b58 = '5'.repeat(90);
    expect(redact(`sig ${b58} end`)).toContain('[REDACTED BASE58]');
  });

  it('redacts key=value secret assignments', () => {
    const out = redact('MY_API_KEY=supersecretvalue');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('supersecretvalue');
  });

  it('redacts URL-embedded credentials', () => {
    const out = redact('https://user:tokenvalue@github.com/x.git');
    expect(out).not.toContain('tokenvalue');
    expect(out).toContain('[REDACTED]@');
  });

  it('redacts the literal value of a secret-looking env var', () => {
    process.env.MY_SECRET_TOKEN = 'abc123hunter2zzz';
    envKeys.push('MY_SECRET_TOKEN');
    expect(redact('leaked abc123hunter2zzz here')).not.toContain('abc123hunter2zzz');
  });

  it('deep-redacts nested object string leaves', () => {
    const out = redactValue({ a: 'Authorization: Bearer deadbeef12345', b: [{ c: 'ok' }] }) as {
      a: string;
      b: { c: string }[];
    };
    expect(out.a).toContain(REDACTED);
    expect(out.b[0]?.c).toBe('ok');
  });
});
