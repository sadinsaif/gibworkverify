import fs from 'node:fs';
import { runFullVerification, type FullVerification } from './verify.js';
import { renderMarkdownReport } from '../reports/markdown.js';
import { renderJsonReport, type ReportModel } from '../reports/json.js';
import { loadProof } from '../proof/integrity.js';
import type { Proof } from '../proof/schema.js';
import { TOOL_NAME } from '../proof/schema.js';
import { ensureWorkspaceDirs, writeJson, fileExists } from '../storage/state.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

/** Render and write the Markdown + JSON reports. */
export async function generateReport(
  rt: Runtime,
  precomputed?: FullVerification,
  proof?: Proof,
): Promise<{ reportMd: string; reportJson: string; rootHash: string | null }> {
  ensureWorkspaceDirs(rt.paths);
  const full = precomputed ?? (await runFullVerification(rt));

  let rootHash: string | null = proof?.rootHash ?? null;
  let evidenceCount = proof?.evidence.length ?? 0;
  let proofCreatedAt: string | null = proof?.createdAt ?? null;
  if (!proof && fileExists(rt.paths.proof)) {
    try {
      const p = loadProof(rt.paths.proof);
      rootHash = p.rootHash;
      evidenceCount = p.evidence.length;
      proofCreatedAt = p.createdAt;
    } catch {
      // A malformed/old proof should not block report generation.
    }
  }

  const model: ReportModel = {
    tool: { name: TOOL_NAME, version: rt.version },
    bounty: full.bounty,
    criteria: full.checklist?.criteria ?? [],
    warnings: full.checklist?.warnings ?? [],
    readiness: full.checklist?.readiness ?? null,
    verification: full.summary,
    git: full.git,
    evidenceCount,
    rootHash,
    proofCreatedAt,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(rt.paths.reportMd, renderMarkdownReport(model));
  writeJson(rt.paths.reportJson, renderJsonReport(model));
  return { reportMd: rt.paths.reportMd, reportJson: rt.paths.reportJson, rootHash };
}

export async function reportCmd(rt: Runtime): Promise<void> {
  const r = await generateReport(rt);
  if (rt.json) {
    emitJson({ reportMd: r.reportMd, reportJson: r.reportJson, rootHash: r.rootHash });
    return;
  }
  info(section('verity report'));
  info(kv('markdown', r.reportMd, 10));
  info(kv('json', r.reportJson, 10));
  if (r.rootHash) info(kv('rootHash', c.cyan(r.rootHash), 10));
  else info(c.dim('  (no proof yet — run `verity prove` to include a root hash)'));
}
