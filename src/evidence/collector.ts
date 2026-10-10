import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, type EvidenceItem, type EvidenceType } from './hasher.js';
import { redactValue } from './sanitizer.js';
import { buildManifest, type Manifest, type ManifestContext } from './manifest.js';
import type { VerificationResult } from '../verification/engine.js';
import type { GitInfo } from '../verification/git-check.js';
import type { VerityPaths } from '../storage/paths.js';

/**
 * Evidence collector.
 *
 * Writes one sanitized JSON file per piece of evidence under `.verity/evidence/`,
 * hashes each file's exact bytes, and assembles a deterministic manifest with a
 * root hash. Every value is passed through the secret sanitizer BEFORE it is
 * written, hashed, or indexed.
 *
 * Evidence file paths are stored POSIX-style and relative to the `.verity` root
 * (e.g. `evidence/check-tests.json`), so the manifest and proof verify
 * identically across platforms.
 */

export interface CollectInput {
  paths: VerityPaths;
  results: VerificationResult[];
  git: GitInfo;
  context: ManifestContext;
  now: string;
}

export interface CollectOutput {
  manifest: Manifest;
  items: EvidenceItem[];
}

function writeEvidenceFile(
  evidenceDir: string,
  filename: string,
  payload: unknown,
): { relPath: string; sha256: string; size: number } {
  const safe = redactValue(payload);
  const content = JSON.stringify(safe, null, 2);
  const buffer = Buffer.from(content, 'utf8');
  fs.writeFileSync(path.join(evidenceDir, filename), buffer);
  return { relPath: `evidence/${filename}`, sha256: sha256Hex(buffer), size: buffer.byteLength };
}

function evidenceTypeFor(resultType: string): EvidenceType {
  switch (resultType) {
    case 'command':
      return 'command';
    case 'test':
      return 'test';
    case 'file':
      return 'file';
    case 'git':
      return 'git';
    default:
      return 'verification';
  }
}

/** Collect, sanitize, hash, and index all evidence; returns the manifest. */
export function collectEvidence(input: CollectInput): CollectOutput {
  const { paths, results, git, context, now } = input;

  // Regenerate the evidence directory from scratch so stale files never linger.
  fs.rmSync(paths.evidenceDir, { recursive: true, force: true });
  fs.mkdirSync(paths.evidenceDir, { recursive: true });

  const items: EvidenceItem[] = [];

  // 1. Git repository state.
  {
    const { relPath, sha256, size } = writeEvidenceFile(paths.evidenceDir, 'git-state.json', git);
    items.push({
      id: 'git-state',
      type: 'git',
      title: 'Git repository state',
      path: relPath,
      sha256,
      size,
      createdAt: now,
    });
  }

  // 2. One file per verification check result.
  for (const result of results) {
    const filename = `check-${result.id}.json`;
    const { relPath, sha256, size } = writeEvidenceFile(paths.evidenceDir, filename, result);
    items.push({
      id: `check-${result.id}`,
      type: evidenceTypeFor(result.type),
      title: result.description || result.id,
      path: relPath,
      sha256,
      size,
      createdAt: now,
    });
  }

  // 3. The full verification summary.
  {
    const summary = {
      passed: context.verification.passed,
      failed: context.verification.failed,
      warnings: context.verification.warnings,
      results,
    };
    const { relPath, sha256, size } = writeEvidenceFile(
      paths.evidenceDir,
      'verification-summary.json',
      summary,
    );
    items.push({
      id: 'verification-summary',
      type: 'verification',
      title: 'Verification summary',
      path: relPath,
      sha256,
      size,
      createdAt: now,
    });
  }

  const manifest = buildManifest(context, items, now);
  fs.writeFileSync(paths.evidenceManifest, JSON.stringify(manifest, null, 2));

  return { manifest, items: manifest.evidence };
}
