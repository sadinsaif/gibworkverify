import { z } from 'zod';
import { sha256Hex, EvidenceItemSchema, type EvidenceItem } from './hasher.js';

/**
 * Deterministic evidence manifest + root hash.
 *
 * CANONICALIZATION ALGORITHM (must stay stable — the root hash depends on it):
 *   1. Build the manifest object from a fixed set of fields:
 *        { schemaVersion, bounty{platform,taskId},
 *          repository{commit,branch},
 *          verification{passed,failed,warnings},
 *          evidence[] }
 *      Note: the manifest's own `rootHash` and `createdAt` are DELIBERATELY
 *      excluded from the hashed form (a hash can't contain itself, and the
 *      wall-clock creation time must not change the hash).
 *   2. Sort `evidence` entries ascending by their `id` (byte-wise on the UTF-8
 *      string). Each entry contributes {id,type,title,path,sha256,size,createdAt};
 *      its per-entry `createdAt` IS included (it is fixed metadata carried in
 *      the proof, not regenerated on verify).
 *   3. Recursively sort every object's keys and serialize with `JSON.stringify`
 *      using no whitespace and no `undefined` values (nulls only). This yields
 *      one exact UTF-8 byte sequence.
 *   4. rootHash = SHA-256(canonical bytes), lowercase hex.
 *
 * `verity verify-proof` rebuilds this exact structure from the proof, but
 * recomputes each evidence file's `sha256`/`size` from disk. If any evidence
 * file changed, its hash differs, the canonical bytes differ, and the recomputed
 * root hash no longer matches the one stored in the proof.
 */

export const ManifestContextSchema = z.object({
  schemaVersion: z.string(),
  bounty: z.object({ platform: z.string(), taskId: z.string().nullable() }),
  repository: z.object({ commit: z.string().nullable(), branch: z.string().nullable() }),
  verification: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
});
export type ManifestContext = z.infer<typeof ManifestContextSchema>;

export const ManifestSchema = ManifestContextSchema.extend({
  evidence: z.array(EvidenceItemSchema),
  rootHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** Recursively sort object keys; serialize compactly. The canonical form. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeys(input[key]);
    }
    return out;
  }
  return value;
}

/** Sort evidence by stable id (ascending, byte-wise). Returns a new array. */
export function sortEvidence(evidence: EvidenceItem[]): EvidenceItem[] {
  return [...evidence].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface RootHashResult {
  canonical: string;
  rootHash: string;
  evidence: EvidenceItem[];
}

/** Compute the canonical bytes and root hash over the context + evidence. */
export function computeRootHash(context: ManifestContext, evidence: EvidenceItem[]): RootHashResult {
  const sorted = sortEvidence(evidence);
  const hashable = { ...context, evidence: sorted };
  const canonical = canonicalize(hashable);
  return { canonical, rootHash: sha256Hex(canonical), evidence: sorted };
}

/** Assemble a persisted manifest (adds rootHash + createdAt around the hashed core). */
export function buildManifest(
  context: ManifestContext,
  evidence: EvidenceItem[],
  createdAt: string,
): Manifest {
  const { rootHash, evidence: sorted } = computeRootHash(context, evidence);
  return { ...context, evidence: sorted, rootHash, createdAt };
}
