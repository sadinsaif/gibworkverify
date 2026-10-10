import fs from 'node:fs';
import { ProofSchema, type Proof, TOOL_NAME } from './schema.js';
import type { Manifest } from '../evidence/manifest.js';

/** Build and persist the Proof-of-Completion receipt from an evidence manifest. */

export interface BuildProofInput {
  version: string;
  manifest: Manifest;
  createdAt: string;
}

export function buildProof(input: BuildProofInput): Proof {
  const { manifest, version, createdAt } = input;
  const proof: Proof = {
    schemaVersion: '1.0',
    tool: { name: TOOL_NAME, version },
    bounty: manifest.bounty,
    repository: manifest.repository,
    verification: manifest.verification,
    evidence: manifest.evidence,
    rootHash: manifest.rootHash,
    createdAt,
  };
  // Validate our own output — fail loudly if we ever drift from the schema.
  return ProofSchema.parse(proof);
}

export function writeProof(proofPath: string, proof: Proof): void {
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
}
