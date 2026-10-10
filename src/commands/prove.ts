import { runFullVerification, type FullVerification } from './verify.js';
import { collectEvidence } from '../evidence/collector.js';
import { buildProof, writeProof } from '../proof/receipt.js';
import type { Proof } from '../proof/schema.js';
import type { ManifestContext } from '../evidence/manifest.js';
import { ensureWorkspaceDirs } from '../storage/state.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

/** Collect evidence and write the Proof-of-Completion receipt. */
export async function generateProof(
  rt: Runtime,
  precomputed?: FullVerification,
): Promise<{ proof: Proof; full: FullVerification }> {
  ensureWorkspaceDirs(rt.paths);
  const full = precomputed ?? (await runFullVerification(rt));
  const now = new Date().toISOString();

  const context: ManifestContext = {
    schemaVersion: '1.0',
    bounty: { platform: 'gibwork', taskId: full.config.taskId },
    repository: { commit: full.git.commit, branch: full.git.branch },
    verification: {
      passed: full.summary.passed,
      failed: full.summary.failed,
      warnings: full.summary.warnings,
    },
  };

  const { manifest } = collectEvidence({
    paths: rt.paths,
    results: full.summary.results,
    git: full.git,
    context,
    now,
  });
  const proof = buildProof({ version: rt.version, manifest, createdAt: now });
  writeProof(rt.paths.proof, proof);
  return { proof, full };
}

export async function proveCmd(rt: Runtime): Promise<void> {
  const { proof } = await generateProof(rt);
  if (rt.json) {
    emitJson({
      proof: rt.paths.proof,
      rootHash: proof.rootHash,
      evidence: proof.evidence.length,
      verification: proof.verification,
    });
    return;
  }
  info(section('verity prove'));
  info(kv('evidence', `${proof.evidence.length} item(s)`, 10));
  info(kv('rootHash', c.cyan(proof.rootHash), 10));
  info(kv('proof', rt.paths.proof, 10));
}
