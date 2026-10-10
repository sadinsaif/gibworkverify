import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * SHA-256 hashing primitives and the hashed evidence-item shape.
 *
 * An EvidenceItem describes one sanitized evidence file stored under
 * `.verity/evidence/`. `sha256` and `size` are computed over that stored file's
 * exact bytes, so re-reading the file and recomputing the hash detects any
 * later tampering (see proof/integrity.ts).
 */

export const EvidenceTypeSchema = z.enum([
  'git',
  'command',
  'test',
  'build',
  'file',
  'verification',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceItemSchema = z.object({
  /** Stable, human-meaningful id; also the manifest sort key. */
  id: z.string().min(1),
  type: EvidenceTypeSchema,
  /** Short human label. */
  title: z.string(),
  /** Path of the stored evidence file, relative to the `.verity` directory. */
  path: z.string(),
  /** SHA-256 (hex) of the stored evidence file's bytes. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Size of the stored evidence file in bytes. */
  size: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/** SHA-256 hex digest of a string or buffer. */
export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
