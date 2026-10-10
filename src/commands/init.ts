import { info, c } from '../utils/logger.js';
import { emitJson, section } from '../utils/output.js';
import {
  ensureWorkspaceDirs,
  defaultConfig,
  emptyChecklist,
  saveConfig,
  saveBounty,
  saveChecklist,
  fileExists,
} from '../storage/state.js';
import type { Runtime } from './context.js';

/** Scaffold a `.verity/` workspace. Idempotent: never clobbers existing files. */
export async function initCmd(rt: Runtime): Promise<void> {
  ensureWorkspaceDirs(rt.paths);

  const created: string[] = [];
  if (!fileExists(rt.paths.config)) {
    saveConfig(rt.paths, defaultConfig(rt.config.environment));
    created.push('config.json');
  }
  if (!fileExists(rt.paths.bounty)) {
    saveBounty(rt.paths, null);
    created.push('bounty.json');
  }
  if (!fileExists(rt.paths.checklist)) {
    saveChecklist(rt.paths, emptyChecklist(null, new Date().toISOString()));
    created.push('checklist.json');
  }

  const data = {
    workspace: rt.paths.root,
    created,
    directories: ['evidence', 'reports', 'proofs'],
  };

  if (rt.json) {
    emitJson(data);
    return;
  }

  info(section('verity init'));
  info(`  workspace: ${c.cyan(rt.paths.root)}`);
  info(`  ${created.length ? `created: ${created.join(', ')}` : c.dim('already initialized')}`);
  info(c.dim('  directories: evidence/ reports/ proofs/'));
  info('');
  info(c.dim('  Next: verity bounty init <TASK_ID>'));
}
