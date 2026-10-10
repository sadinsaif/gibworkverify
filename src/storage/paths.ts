import os from 'node:os';
import path from 'node:path';

/**
 * Filesystem layout for Verity.
 *
 * Two distinct locations:
 *   1. The per-user APP HOME (`appHome`) holds only the auto-generated
 *      read-only auth keypair. Honors VERITY_HOME, else a per-OS default.
 *   2. The per-project `.verity/` WORKSPACE (`verityPaths`) holds all local
 *      artifacts for one target repository: config, bounty snapshot, checklist,
 *      evidence files, reports, proof, and the submission intent record.
 */

/** Per-user application directory where the throwaway read-only keypair lives. */
export function appHome(): string {
  const override = process.env.VERITY_HOME?.trim();
  if (override) return path.resolve(override);

  const platform = process.platform;
  if (platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'gibwork-verity');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'gibwork-verity');
  }
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'gibwork-verity');
}

/** File holding the auto-generated read-only keypair. */
export function ephemeralKeyPath(): string {
  return path.join(appHome(), 'read-only-key.json');
}

/** The `.verity` workspace directory name. */
export const VERITY_DIR = '.verity';

export interface VerityPaths {
  /** <cwd>/.verity */
  root: string;
  config: string;
  bounty: string;
  checklist: string;
  evidenceDir: string;
  /** evidence/manifest.json — the index of collected evidence items. */
  evidenceManifest: string;
  reportsDir: string;
  reportMd: string;
  reportJson: string;
  proofsDir: string;
  proof: string;
  /** submission.json — persisted intent record for recovery (no secrets). */
  submission: string;
}

/** Resolve every `.verity/` path for a target repository directory. */
export function verityPaths(cwd: string): VerityPaths {
  const root = path.join(cwd, VERITY_DIR);
  const evidenceDir = path.join(root, 'evidence');
  const reportsDir = path.join(root, 'reports');
  const proofsDir = path.join(root, 'proofs');
  return {
    root,
    config: path.join(root, 'config.json'),
    bounty: path.join(root, 'bounty.json'),
    checklist: path.join(root, 'checklist.json'),
    evidenceDir,
    evidenceManifest: path.join(evidenceDir, 'manifest.json'),
    reportsDir,
    reportMd: path.join(reportsDir, 'report.md'),
    reportJson: path.join(reportsDir, 'report.json'),
    proofsDir,
    proof: path.join(proofsDir, 'proof.json'),
    submission: path.join(root, 'submission.json'),
  };
}
