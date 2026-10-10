import fs from 'node:fs';
import path from 'node:path';
import { ManifestSchema } from '../evidence/manifest.js';
import { readJson, fileExists } from '../storage/state.js';
import { invalidInput } from '../utils/errors.js';
import { info, c } from '../utils/logger.js';
import { emitJson, kv, section } from '../utils/output.js';
import type { Runtime } from './context.js';

function requireManifest(rt: Runtime) {
  if (!fileExists(rt.paths.evidenceManifest)) {
    throw invalidInput('No evidence yet. Run `verity prove` first.');
  }
  return readJson(rt.paths.evidenceManifest, ManifestSchema);
}

export async function evidenceListCmd(rt: Runtime): Promise<void> {
  const manifest = requireManifest(rt);
  if (rt.json) {
    emitJson({ rootHash: manifest.rootHash, items: manifest.evidence });
    return;
  }
  info(section(`evidence (${manifest.evidence.length} item(s))`));
  for (const e of manifest.evidence) {
    info(`  ${c.cyan(e.id.padEnd(24))} ${e.type.padEnd(13)} ${c.dim(e.sha256.slice(0, 12))} ${e.size}b`);
  }
  info('');
  info(kv('rootHash', c.cyan(manifest.rootHash), 10));
}

export async function evidenceShowCmd(id: string, rt: Runtime): Promise<void> {
  const manifest = requireManifest(rt);
  const item = manifest.evidence.find((e) => e.id === id);
  if (!item) {
    throw invalidInput(`No evidence item with id "${id}". Try \`verity evidence list\`.`);
  }
  const abs = path.join(rt.paths.root, item.path);
  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    throw invalidInput(`Evidence file is missing on disk: ${item.path}`);
  }

  if (rt.json) {
    let parsed: unknown = content;
    try {
      parsed = JSON.parse(content);
    } catch {
      // leave as raw string
    }
    emitJson({ item, content: parsed });
    return;
  }

  info(section(item.id));
  info(kv('type', item.type));
  info(kv('path', item.path));
  info(kv('sha256', item.sha256));
  info(kv('size', `${item.size} bytes`));
  info('');
  info(content);
}
