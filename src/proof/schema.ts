import { z } from 'zod';
import { EvidenceItemSchema } from '../evidence/hasher.js';

/**
 * The Proof-of-Completion receipt schema (schemaVersion 1.0).
 *
 * It carries NO secrets. It embeds the same context the manifest root hash was
 * computed over (schemaVersion, bounty, repository, verification) plus the
 * evidence index and the root hash, so `verify-proof` can recompute and compare.
 */

export const TOOL_NAME = 'gibwork-verity';

export const ProofSchema = z.object({
  schemaVersion: z.literal('1.0'),
  tool: z.object({ name: z.string(), version: z.string() }),
  bounty: z.object({ platform: z.string(), taskId: z.string().nullable() }),
  repository: z.object({ commit: z.string().nullable(), branch: z.string().nullable() }),
  verification: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  evidence: z.array(EvidenceItemSchema),
  rootHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string(),
});
export type Proof = z.infer<typeof ProofSchema>;
