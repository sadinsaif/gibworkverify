import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, type EvidenceItem } from '../evidence/hasher.js';
import { computeRootHash, type ManifestContext } from '../evidence/manifest.js';
import { ProofSchema, type Proof } from './schema.js';
import { invalidInput } from '../utils/errors.js';

/**
 * Proof verification (tamper detection).
 *
 * Re-reads every evidence file referenced by the proof, recomputes its SHA-256
 * and size, rebuilds the exact canonical manifest from the proof's context, and
 * recomputes the root hash. If any evidence file changed or is missing — or the
 * proof's own context fields were edited — the recomputed root hash no longer
 * matches the one stored in the proof.
 *
 * NOTE: the root hash is an integrity checksum, not a digital signature. It
 * detects accidental or naive tampering with evidence or the proof; it does not
 * defend against a motivated party who simply regenerates a fresh proof.
 */

const ZERO_HASH = '0'.repeat(64);

export interface ProofItemCheck {
  id: string;
  path: string;
  ok: boolean;
  expectedSha256: string;
  actualSha256: string | null;
}

export interface ProofVerification {
  valid: boolean;
  expectedRootHash: string;
  actualRootHash: string;
  items: ProofItemCheck[];
  missing: string[];
  changed: string[];
  proof: Proof;
}

/** Load and schema-validate a proof file. */
export function loadProof(proofPath: string): Proof {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  } catch {
    throw invalidInput(`Cannot read proof file: ${proofPath}`);
  }
  const parsed = ProofSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalidInput(`Proof file is malformed or not a Verity proof: ${proofPath}`);
  }
  return parsed.data;
}

export function verifyProofFile(proofPath: string): ProofVerification {
  const proof = loadProof(proofPath);
  // The proof lives at <root>/proofs/proof.json; evidence paths are relative to <root>.
  const root = path.resolve(path.dirname(proofPath), '..');

  const items: ProofItemCheck[] = [];
  const missing: string[] = [];
  const changed: string[] = [];

  const recomputed: EvidenceItem[] = proof.evidence.map((item) => {
    const abs = path.join(root, item.path);
    let actualSha: string | null = null;
    let actualSize = 0;
    try {
      const buf = fs.readFileSync(abs);
      actualSha = sha256Hex(buf);
      actualSize = buf.byteLength;
    } catch {
      actualSha = null;
    }

    const ok = actualSha === item.sha256 && actualSize === item.size;
    items.push({
      id: item.id,
      path: item.path,
      ok,
      expectedSha256: item.sha256,
      actualSha256: actualSha,
    });
    if (actualSha === null) missing.push(item.id);
    else if (!ok) changed.push(item.id);

    return { ...item, sha256: actualSha ?? ZERO_HASH, size: actualSize };
  });

  const context: ManifestContext = {
    schemaVersion: proof.schemaVersion,
    bounty: proof.bounty,
    repository: proof.repository,
    verification: proof.verification,
  };
  const { rootHash: actualRootHash } = computeRootHash(context, recomputed);

  const valid = missing.length === 0 && changed.length === 0 && actualRootHash === proof.rootHash;
  return { valid, expectedRootHash: proof.rootHash, actualRootHash, items, missing, changed, proof };
}
